import { INGESTION_QUEUE, SOURCE_KEYS, scrapeQueueName, type SourceKey } from '@leads/shared';

export interface QueueSpec {
  name: string;
  /** null for the ingestion queue; sources get their own limiter in phase 2. */
  source: SourceKey | null;
}

/**
 * One queue per source plus the ingestion queue. Isolation is the point: a slow or rate-limited
 * source only ever backs up its own queue. Limiters and backoff are attached per source in phase 2,
 * after each source's documented limits are verified (docs/sources.md).
 */
export function buildQueueRegistry(): QueueSpec[] {
  return [
    ...SOURCE_KEYS.map((source) => ({ name: scrapeQueueName(source), source })),
    { name: INGESTION_QUEUE, source: null },
  ];
}
