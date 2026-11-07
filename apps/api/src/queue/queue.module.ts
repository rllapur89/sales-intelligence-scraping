import { Global, Inject, Injectable, Module, type OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Queue } from 'bullmq';
import { Redis } from 'ioredis';
import { SOURCE_KEYS, scrapeQueueName, type ScrapeTaskData, type SourceKey } from '@leads/shared';

export type ScrapeQueue = Queue<ScrapeTaskData>;
export type ScrapeQueues = Record<SourceKey, ScrapeQueue>;

export const REDIS_CONNECTION = Symbol('REDIS_CONNECTION');
export const SCRAPE_QUEUES = Symbol('SCRAPE_QUEUES');

/** Closes the queues and the shared Redis connection when the Nest app shuts down. */
@Injectable()
export class QueueLifecycle implements OnModuleDestroy {
  constructor(
    @Inject(SCRAPE_QUEUES) private readonly queues: ScrapeQueues,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {}

  async onModuleDestroy(): Promise<void> {
    await Promise.all(Object.values(this.queues).map((queue) => queue.close()));
    await this.redis.quit();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CONNECTION,
      inject: [ConfigService],
      useFactory: (config: ConfigService): Redis =>
        new Redis(config.getOrThrow<string>('REDIS_URL'), { maxRetriesPerRequest: null }),
    },
    {
      provide: SCRAPE_QUEUES,
      inject: [REDIS_CONNECTION],
      useFactory: (redis: Redis): ScrapeQueues => {
        const queues = {} as ScrapeQueues;
        for (const source of SOURCE_KEYS) {
          queues[source] = new Queue<ScrapeTaskData>(scrapeQueueName(source), {
            connection: redis,
          });
        }
        return queues;
      },
    },
    QueueLifecycle,
  ],
  exports: [SCRAPE_QUEUES, REDIS_CONNECTION],
})
export class QueueModule {}
