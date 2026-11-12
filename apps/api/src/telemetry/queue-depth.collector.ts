import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { SCRAPE_QUEUES, type ScrapeQueues } from '../queue/queue.module';
import { TelemetryService } from './telemetry.service';

export const QUEUE_STATES = ['waiting', 'active', 'delayed', 'failed', 'completed'] as const;
export const DEFAULT_QUEUE_POLL_MS = 5000;

/** Minimal queue view so the polling logic can be tested without Redis. */
export interface CountableQueue {
  name: string;
  getJobCounts(...states: string[]): Promise<Record<string, number>>;
}

/** Reads the job counts of each queue and publishes them as gauges. Pure of timers. */
export async function collectQueueDepth(
  queues: readonly CountableQueue[],
  telemetry: Pick<TelemetryService, 'setQueueDepth'>,
): Promise<void> {
  await Promise.all(
    queues.map(async (queue) => {
      const counts = await queue.getJobCounts(...QUEUE_STATES);
      for (const state of QUEUE_STATES) {
        telemetry.setQueueDepth(queue.name, state, counts[state] ?? 0);
      }
    }),
  );
}

/** Polls queue depth on an interval; a failing poll is logged and never crashes the API. */
@Injectable()
export class QueueDepthCollector implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(QueueDepthCollector.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    @Inject(SCRAPE_QUEUES) private readonly queues: ScrapeQueues,
    private readonly telemetry: TelemetryService,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => void this.poll(), DEFAULT_QUEUE_POLL_MS);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
  }

  async poll(): Promise<void> {
    try {
      await collectQueueDepth(Object.values(this.queues), this.telemetry);
    } catch (err) {
      this.logger.warn(`Queue depth poll failed: ${String(err)}`);
    }
  }
}
