import { Counter, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import type { SourceKey } from '@leads/shared';
import type { ScrapeObserver, ScrapeOutcome } from './scrape-observer';

export const DURATION_BUCKETS_SECONDS = [0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60] as const;
export const ITEMS_BUCKETS = [0, 1, 5, 10, 25, 50, 100, 250, 1000] as const;

/** Prometheus registry of the workers process; implements the observer the handler reports to. */
export class WorkersTelemetry implements ScrapeObserver {
  readonly registry = new Registry();

  private readonly tasks = new Counter({
    name: 'leads_scrape_tasks_total',
    help: 'Scrape tasks finished, by source and outcome',
    labelNames: ['source', 'outcome'] as const,
    registers: [this.registry],
  });

  private readonly duration = new Histogram({
    name: 'leads_scrape_duration_seconds',
    help: 'Duration of one scrape task, by source',
    labelNames: ['source'] as const,
    buckets: [...DURATION_BUCKETS_SECONDS],
    registers: [this.registry],
  });

  private readonly items = new Histogram({
    name: 'leads_scrape_items_found',
    help: 'Items found by one scrape task, by source',
    labelNames: ['source'] as const,
    buckets: [...ITEMS_BUCKETS],
    registers: [this.registry],
  });

  private readonly rateLimits = new Counter({
    name: 'leads_scrape_rate_limited_total',
    help: 'Times a source answered 429 or exhausted its rate limit',
    labelNames: ['source'] as const,
    registers: [this.registry],
  });

  private readonly pauseSeconds = new Counter({
    name: 'leads_scrape_queue_paused_seconds_total',
    help: 'Total seconds a source queue was paused after rate limiting',
    labelNames: ['source'] as const,
    registers: [this.registry],
  });

  private readonly retries = new Counter({
    name: 'leads_scrape_retries_total',
    help: 'Scrape task attempts that failed and were handed back for retry',
    labelNames: ['source'] as const,
    registers: [this.registry],
  });

  private readonly ingested = new Counter({
    name: 'leads_ingestion_results_total',
    help: 'Raw results processed by ingestion, by result',
    labelNames: ['result'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'leads_workers_' });
  }

  taskFinished(source: SourceKey, outcome: ScrapeOutcome, durationSeconds: number): void {
    this.tasks.inc({ source, outcome });
    this.duration.observe({ source }, durationSeconds);
  }

  itemsFound(source: SourceKey, count: number): void {
    this.items.observe({ source }, count);
  }

  rateLimited(source: SourceKey, pauseMs: number): void {
    this.rateLimits.inc({ source });
    this.pauseSeconds.inc({ source }, pauseMs / 1000);
  }

  retried(source: SourceKey): void {
    this.retries.inc({ source });
  }

  ingestionResult(result: 'ok' | 'error'): void {
    this.ingested.inc({ result });
  }

  render(): Promise<string> {
    return this.registry.metrics();
  }
}
