import { Injectable, Logger, type OnModuleDestroy, type OnModuleInit } from '@nestjs/common';
import { PrismaClient } from '@leads/db';
import {
  INGESTION_POLICY,
  INGESTION_QUEUE,
  LEAD_EVENTS_CHANNEL,
  SOURCE_POLICIES,
  scrapeQueueName,
  type RawScrapeResult,
  type ScrapeTaskData,
} from '@leads/shared';
import { Queue, Worker, type Job } from 'bullmq';
import type { Server } from 'node:http';
import { Redis } from 'ioredis';
import { validateEnv, type WorkersEnv } from '../config/env';
import { HttpError } from '../http/http-client';
import { IngestionService, type EventPublisher } from '../ingestion/ingestion.service';
import { loadCompaniesConfig } from '../scrapers/companies-config';
import { PresenceHeartbeat } from '../presence/presence-heartbeat';
import { PrismaScrapeJobStore } from '../scraping/job-store';
import { ScrapeTaskHandler } from '../scraping/scrape-task.handler';
import { jitteredBackoffMs } from './backoff';
import {
  readMetricsPort,
  startMetricsServer,
  stopMetricsServer,
} from '../telemetry/metrics-server';
import { WorkersTelemetry } from '../telemetry/workers-telemetry';
import { buildScrapers, decideSources, resolveTargets } from './source-registry';

/**
 * Owns every BullMQ worker of this process: one worker (and limiter) per reviewed source, plus
 * ingestion. Sources are isolated: each has its own queue, limiter, concurrency and backoff, so a
 * rate-limited or slow source only backs up its own queue.
 */
@Injectable()
export class QueueService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueService.name);
  private env!: WorkersEnv;
  private redis!: Redis;
  private publisherRedis!: Redis;
  private prisma!: PrismaClient;
  private readonly workers: Worker[] = [];
  private readonly queues = new Map<string, Queue>();
  private readonly telemetry = new WorkersTelemetry();
  private metricsServer: Server | null = null;
  private heartbeat: PresenceHeartbeat | null = null;

  async onModuleInit(): Promise<void> {
    this.env = validateEnv(process.env);
    // BullMQ requires maxRetriesPerRequest: null on blocking connections.
    this.redis = new Redis(this.env.redisUrl, { maxRetriesPerRequest: null });
    this.publisherRedis = new Redis(this.env.redisUrl);
    this.prisma = new PrismaClient();
    await this.prisma.$connect();

    const metricsPort = readMetricsPort(process.env['WORKERS_METRICS_PORT']);
    if (metricsPort !== null) {
      this.metricsServer = await startMetricsServer(this.telemetry.registry, metricsPort);
      this.logger.log(`Metrics on :${metricsPort}/metrics`);
    }

    this.heartbeat = new PresenceHeartbeat(
      (key, ttl) => this.publisherRedis.set(key, '1', 'EX', ttl),
      (err) => this.logger.warn(`Presence heartbeat failed: ${String(err)}`),
    );
    this.heartbeat.start();

    const scrapers = buildScrapers(this.env, {
      onWebsiteSkip: (reason, target) =>
        this.logger.log(`website: skipped ${target.domain}: ${reason}`),
    });
    const companies = loadCompaniesConfig(this.env.companiesConfigPath);
    const targetSources = {
      config: companies,
      loadCompanyRows: () =>
        this.prisma.company.findMany({
          select: { name: true, domain: true, industry: true, region: true },
          orderBy: { domain: 'asc' },
        }),
    };

    const ingestionQueue = this.queue(INGESTION_QUEUE);
    const publisher: EventPublisher = {
      publish: async (event) => {
        await this.publisherRedis.publish(LEAD_EVENTS_CHANNEL, JSON.stringify(event));
      },
    };
    this.startIngestionWorker(new IngestionService(this.prisma, publisher));

    for (const decision of decideSources(process.env)) {
      const source = decision.source;
      const policy = SOURCE_POLICIES[source];
      if (!decision.start || !scrapers.has(source)) {
        this.logger.log(
          `Source ${source}: not started (${decision.reason ?? 'no scraper registered'})`,
        );
        continue;
      }
      const queue = this.queue(scrapeQueueName(source));
      const handler = new ScrapeTaskHandler({
        scrapers,
        jobs: new PrismaScrapeJobStore(this.prisma),
        policyFor: (s) => SOURCE_POLICIES[s],
        observer: this.telemetry,
        loadTargets: (s, slugs) => resolveTargets(s, targetSources, slugs),
        enqueueCompany: async (task) => {
          await queue.add(`company:${task.target.slug}`, task, {
            jobId: `${task.scrapingJobId}__${task.target.slug}`,
            attempts: policy.attempts,
            backoff: { type: 'custom' },
            removeOnComplete: { count: 2000 },
            removeOnFail: { count: 5000 },
          });
        },
        publishRaw: async (result: RawScrapeResult) => {
          await ingestionQueue.add('ingest', result, {
            jobId: `${result.jobId}__${result.target}`,
            attempts: INGESTION_POLICY.attempts,
            backoff: { type: 'exponential', delay: INGESTION_POLICY.backoff.baseMs },
            removeOnComplete: { count: 2000 },
            removeOnFail: { count: 5000 },
          });
        },
      });

      const worker: Worker<ScrapeTaskData> = new Worker<ScrapeTaskData>(
        scrapeQueueName(source),
        async (job: Job<ScrapeTaskData>) =>
          handler.handle(job.data, {
            attemptsMade: job.attemptsMade,
            pauseQueue: (ms) => worker.rateLimit(ms),
          }),
        {
          connection: this.redis,
          concurrency: policy.concurrency,
          // Shared across all worker instances through Redis: max queue jobs per duration.
          limiter: { max: policy.limiter.max, duration: policy.limiter.durationMs },
          settings: {
            backoffStrategy: (attemptsMade, _type, err) =>
              jitteredBackoffMs(
                attemptsMade,
                policy.backoff,
                Math.random,
                err instanceof HttpError ? err.retryAfterMs : undefined,
              ),
          },
        },
      );
      worker.on('error', (err) => this.logger.error(`${source} worker error: ${err.message}`));
      this.workers.push(worker);
      this.heartbeat.add(source);
      this.logger.log(
        `Source ${source}: worker up (limiter ${policy.limiter.max}/${policy.limiter.durationMs} ms, concurrency ${policy.concurrency})`,
      );
    }
  }

  private startIngestionWorker(service: IngestionService): void {
    const worker = new Worker<RawScrapeResult>(
      INGESTION_QUEUE,
      async (job) => {
        const summary = await service.ingest(job.data);
        this.telemetry.ingestionResult(summary.failedDomains.length > 0 ? 'error' : 'ok');
        if (summary.failedDomains.length > 0) {
          // Ingestion is idempotent (signals dedupe on source + externalId), so retrying is safe.
          throw new Error(`Ingestion failed for: ${summary.failedDomains.join(', ')}`);
        }
        return summary;
      },
      {
        connection: this.redis,
        concurrency: INGESTION_POLICY.concurrency,
        settings: {
          backoffStrategy: (attemptsMade) =>
            jitteredBackoffMs(attemptsMade, INGESTION_POLICY.backoff),
        },
      },
    );
    worker.on('error', (err) => this.logger.error(`ingestion worker error: ${err.message}`));
    this.workers.push(worker);
  }

  private queue(name: string): Queue {
    const existing = this.queues.get(name);
    if (existing) return existing;
    const q = new Queue(name, { connection: this.redis });
    this.queues.set(name, q);
    return q;
  }

  async onModuleDestroy(): Promise<void> {
    await Promise.all(this.workers.map((w) => w.close()));
    await Promise.all([...this.queues.values()].map((q) => q.close()));
    this.heartbeat?.stop();
    if (this.metricsServer) await stopMetricsServer(this.metricsServer);
    await this.prisma?.$disconnect();
    this.redis?.disconnect();
    this.publisherRedis?.disconnect();
  }
}
