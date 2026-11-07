/** Every public data source the platform may collect from. One BullMQ queue per source. */
export const SOURCE_KEYS = [
  'greenhouse',
  'lever',
  'hn-hiring',
  'remoteok',
  'github',
  'sec-edgar',
  'website',
] as const;

export type SourceKey = (typeof SOURCE_KEYS)[number];

/** Ingestion queue: scrapers publish raw results here, they never touch the DB or clients. */
export const INGESTION_QUEUE = 'ingestion';

/** Redis pub/sub channel carrying `LeadUpsertedEvent` from ingestion to API instances. */
export const LEAD_EVENTS_CHANNEL = 'leads:events';

/** BullMQ forbids ':' in queue names, so the prefix uses a dash. */
export function scrapeQueueName(source: SourceKey): string {
  return `scrape-${source}`;
}
