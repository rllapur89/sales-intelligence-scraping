import { Logger } from '@nestjs/common';
import type {
  CompanyTarget,
  RawScrapeResult,
  ScrapeTaskData,
  SourceKey,
  SourcePolicy,
} from '@leads/shared';
import { HttpError } from '../http/http-client';
import { jitteredBackoffMs } from '../queues/backoff';
import type { Scraper } from '../scrapers/scraper';
import { NOOP_OBSERVER, type ScrapeObserver } from '../telemetry/scrape-observer';
import type { ScrapeJobStore } from './job-store';

export interface ScrapeTaskDeps {
  scrapers: ReadonlyMap<SourceKey, Scraper>;
  jobs: ScrapeJobStore;
  policyFor: (source: SourceKey) => SourcePolicy;
  /** Resolves the targets of a plan (config entries, optionally filtered by slug). */
  loadTargets: (source: SourceKey, slugs?: string[]) => CompanyTarget[] | Promise<CompanyTarget[]>;
  enqueueCompany: (task: Extract<ScrapeTaskData, { kind: 'company' }>) => Promise<void>;
  /** Hands raw results to the ingestion queue. Scrapers never touch the DB or clients. */
  publishRaw: (result: RawScrapeResult) => Promise<void>;
  now?: () => number;
  /** Receives metrics events; defaults to a no-op. */
  observer?: ScrapeObserver;
}

export interface TaskContext {
  /** How many attempts already ran for this queue job (0 on the first try). */
  attemptsMade: number;
  /** Pauses the whole source queue (a 429 means the source, not one task, is saturated). */
  pauseQueue: (ms: number) => Promise<void>;
}

export type TaskOutcome = 'planned' | 'scraped' | 'failed' | 'skipped';

/**
 * Executes one job of a `scrape-<source>` queue. A `plan` job fans out into one `company` job per
 * target, so the queue limiter (jobs per duration) equals requests per duration.
 * Retryable failures are rethrown so BullMQ retries them with jittered backoff; the last attempt,
 * and non-retryable errors (404...), are recorded on the ScrapingJob instead.
 */
export class ScrapeTaskHandler {
  private readonly logger = new Logger(ScrapeTaskHandler.name);

  constructor(private readonly deps: ScrapeTaskDeps) {}

  async handle(task: ScrapeTaskData, ctx: TaskContext): Promise<TaskOutcome> {
    const status = await this.deps.jobs.getStatus(task.scrapingJobId);
    if (task.kind === 'plan') {
      if (status !== 'QUEUED') return 'skipped';
      return this.plan(task);
    }
    if (status !== 'RUNNING') return 'skipped'; // cancelled, failed or unknown: do no work
    return this.scrapeCompany(task, ctx);
  }

  private async plan(task: Extract<ScrapeTaskData, { kind: 'plan' }>): Promise<TaskOutcome> {
    if (!this.deps.scrapers.has(task.source)) {
      await this.deps.jobs.fail(task.scrapingJobId, `No scraper registered for ${task.source}`);
      return 'failed';
    }
    const targets = await this.deps.loadTargets(task.source, task.slugs);
    if (targets.length === 0) {
      await this.deps.jobs.fail(task.scrapingJobId, 'No matching targets in the companies config');
      return 'failed';
    }
    await this.deps.jobs.markRunning(task.scrapingJobId, targets.length);
    for (const target of targets) {
      await this.deps.enqueueCompany({
        kind: 'company',
        scrapingJobId: task.scrapingJobId,
        source: task.source,
        target,
      });
    }
    return 'planned';
  }

  private async scrapeCompany(
    task: Extract<ScrapeTaskData, { kind: 'company' }>,
    ctx: TaskContext,
  ): Promise<TaskOutcome> {
    const scraper = this.deps.scrapers.get(task.source);
    if (!scraper) throw new Error(`No scraper registered for ${task.source}`);
    const policy = this.deps.policyFor(task.source);
    const now = this.deps.now ?? Date.now;
    const observer = this.deps.observer ?? NOOP_OBSERVER;

    const scrapedAt = now();
    try {
      const items = await scraper.scrape(task.target);
      await this.deps.publishRaw({
        source: task.source,
        jobId: task.scrapingJobId,
        target: task.target.slug,
        scrapedAt,
        items,
      });
      await this.deps.jobs.recordTask(task.scrapingJobId, { itemsFound: items.length });
      await this.deps.jobs.recordSourceOutcome(task.source, { ok: true });
      observer.itemsFound(task.source, items.length);
      observer.taskFinished(task.source, 'scraped', (now() - scrapedAt) / 1000);
      return 'scraped';
    } catch (err) {
      const http = err instanceof HttpError ? err : null;
      const retryable = http ? http.retryable : true;
      const lastAttempt = ctx.attemptsMade + 1 >= policy.attempts;

      if (http && (http.status === 429 || http.rateLimited)) {
        const pause = http.retryAfterMs ?? jitteredBackoffMs(ctx.attemptsMade + 1, policy.backoff);
        this.logger.warn(`${task.source} rate limited, pausing queue ${pause} ms`);
        observer.rateLimited(task.source, pause);
        await ctx.pauseQueue(pause);
      }
      if (retryable && !lastAttempt) {
        observer.retried(task.source);
        throw err;
      }

      const message = `${task.target.slug}: ${(err as Error).message}`;
      this.logger.warn(`${task.source} task failed for good: ${message}`);
      await this.deps.jobs.recordTask(task.scrapingJobId, { itemsFound: 0, error: message });
      await this.deps.jobs.recordSourceOutcome(task.source, { ok: false, error: message });
      observer.taskFinished(task.source, 'failed', (now() - scrapedAt) / 1000);
      return 'failed';
    }
  }
}
