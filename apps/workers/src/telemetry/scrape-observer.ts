import type { SourceKey } from '@leads/shared';

export type ScrapeOutcome = 'scraped' | 'failed';

/** What the scrape handler reports. A no-op default keeps metrics optional in tests. */
export interface ScrapeObserver {
  taskFinished(source: SourceKey, outcome: ScrapeOutcome, durationSeconds: number): void;
  itemsFound(source: SourceKey, count: number): void;
  rateLimited(source: SourceKey, pauseMs: number): void;
  retried(source: SourceKey): void;
}

export const NOOP_OBSERVER: ScrapeObserver = {
  taskFinished: () => undefined,
  itemsFound: () => undefined,
  rateLimited: () => undefined,
  retried: () => undefined,
};
