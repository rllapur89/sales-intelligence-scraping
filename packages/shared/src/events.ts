import type { LeadDto } from './domain';
import type { SourceKey } from './sources';
import type { RawSignalItem } from './scraping';

/** Pipeline timestamps (epoch ms) used to measure scrape-to-screen latency. */
export interface EventTimings {
  scrapedAt: number;
  ingestedAt: number;
  /** Set by the API gateway right before emit. */
  publishedAt?: number;
}

/** Emitted by ingestion after a transactional upsert; `seq` is monotonic. */
export interface LeadUpsertedEvent {
  type: 'lead.upserted';
  seq: number;
  source: SourceKey;
  lead: LeadDto;
  timings: EventTimings;
}

/** Raw result a scraper publishes to the ingestion queue. */
export interface RawScrapeResult {
  source: SourceKey;
  /** ScrapingJob id this result belongs to. */
  jobId: string;
  /** Human label of what was scraped, e.g. the company slug. */
  target: string;
  scrapedAt: number;
  items: RawSignalItem[];
}

// ---- Socket.IO contract -----------------------------------------------------------------------

export interface LeadBatch {
  fromSeq: number;
  toSeq: number;
  /** Coalesced per lead id: only the latest version of each lead. */
  leads: LeadDto[];
  /** Timings per lead id, for latency ack sampling. */
  timings: Record<string, EventTimings>;
}

export interface ResyncRequest {
  lastSeq: number;
}

export type ResyncResponse =
  | { mode: 'delta'; batches: LeadBatch[]; currentSeq: number }
  | { mode: 'full'; reason: 'gap-too-large' | 'unknown-seq'; currentSeq: number };

export interface LatencyAck {
  leadId: string;
  seq: number;
  renderedAt: number;
  timings: EventTimings;
}

/**
 * Sent when leads the socket holds stop matching its user's subscriptions. `seq` is the highest
 * event sequence of the window that caused it, so the client can advance its `lastSeq`.
 */
export interface LeadsRetracted {
  leadIds: string[];
  seq: number;
}

export interface ServerToClientEvents {
  'leads:batch': (batch: LeadBatch) => void;
  'leads:retracted': (retraction: LeadsRetracted) => void;
  'leads:resync-required': (info: { currentSeq: number }) => void;
}

export interface ClientToServerEvents {
  'leads:resync': (req: ResyncRequest, cb: (res: ResyncResponse) => void) => void;
  'latency:ack': (acks: LatencyAck[]) => void;
}

/** Redis pub/sub channel: payload is the id (string) of a user whose subscriptions changed. */
export const SUBSCRIPTIONS_CHANGED_CHANNEL = 'leads:subscriptions-changed';
