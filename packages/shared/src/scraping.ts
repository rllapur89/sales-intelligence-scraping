import type { SignalType } from './domain';
import type { SourceKey } from './sources';

/** Queue behaviour for one source. Values come from docs/sources.md, never from guesses. */
export interface SourcePolicy {
  /** False until the source's terms and limits were reviewed; workers do not start unreviewed sources. */
  reviewed: boolean;
  /** BullMQ worker limiter: at most `max` queue jobs per `durationMs`. One queue job = one HTTP request. */
  limiter: { max: number; durationMs: number };
  concurrency: number;
  /** Environment variables the source needs (token, User-Agent). Workers skip the source when any is unset. */
  requiredEnv: string[];
  /** Total attempts per task (first try included). */
  attempts: number;
  /** Exponential backoff with full jitter: random(0, min(capMs, baseMs * 2^attempt)). */
  backoff: { baseMs: number; capMs: number };
}

const UNREVIEWED: SourcePolicy = {
  reviewed: false,
  limiter: { max: 1, durationMs: 1000 },
  concurrency: 1,
  requiredEnv: [],
  attempts: 5,
  backoff: { baseMs: 2000, capMs: 120_000 },
};

/** Greenhouse and Lever document no read limit; these are conservative self-imposed values. */
const COURTESY: SourcePolicy = {
  reviewed: true,
  limiter: { max: 2, durationMs: 1000 },
  concurrency: 1,
  requiredEnv: [],
  attempts: 5,
  backoff: { baseMs: 2000, capMs: 120_000 },
};

/**
 * Limits per docs/sources.md. One queue job = one task; sources that need several HTTP requests per
 * task (github: up to 4) size the limiter for that.
 */
export const SOURCE_POLICIES: Record<SourceKey, SourcePolicy> = {
  greenhouse: COURTESY,
  lever: COURTESY,
  // HN: terms unclear (docs/sources.md), waiting for the owner's decision.
  'hn-hiring': UNREVIEWED,
  // robots.txt asks Crawl-delay: 1; one request returns the whole feed.
  remoteok: { ...COURTESY, limiter: { max: 1, durationMs: 2000 } },
  // 5,000 requests/hour authenticated; <= 4 requests per task at 1 task/4 s is ~1 request/s.
  github: { ...COURTESY, limiter: { max: 1, durationMs: 4000 }, requiredEnv: ['GITHUB_TOKEN'] },
  // Documented max 10 requests/second across all machines; we use 4.
  'sec-edgar': {
    ...COURTESY,
    limiter: { max: 4, durationMs: 1000 },
    requiredEnv: ['SEC_EDGAR_USER_AGENT'],
  },
  // robots.txt + home page = 2 requests per task.
  website: { ...COURTESY, limiter: { max: 1, durationMs: 2000 } },
};

export const INGESTION_POLICY = {
  concurrency: 5,
  attempts: 3,
  backoff: { baseMs: 1000, capMs: 30_000 },
};

/** A company entry from the editable companies config. */
export interface CompanyTarget {
  slug: string;
  name: string;
  domain: string;
  industry?: string | null;
  region?: string | null;
  /** GitHub organization login (github source). */
  githubOrg?: string | null;
  /** Stock ticker, used to resolve the SEC CIK (sec-edgar source). */
  secTicker?: string | null;
}

/** Data of one job in a `scrape-<source>` queue. A `plan` job fans out into `company` jobs. */
export type ScrapeTaskData =
  | { kind: 'plan'; scrapingJobId: string; source: SourceKey; slugs?: string[] }
  | { kind: 'company'; scrapingJobId: string; source: SourceKey; target: CompanyTarget };

/** A company plus one buying signal, as a scraper emits it. Contains no personal data. */
export interface RawSignalItem {
  company: {
    name: string;
    domain: string;
    industry?: string | null;
    region?: string | null;
    /** Enrichment: fills gaps only, never erases known values. */
    description?: string | null;
    techHints?: string[];
  };
  signal: {
    type: SignalType;
    /** Stable id inside the source; makes re-runs idempotent. */
    externalId: string;
    detectedAt: string;
    payload: Record<string, unknown>;
  };
}

/** `SourceKey` ('hn-hiring') to the Prisma enum name ('HN_HIRING'). */
export function toDbSourceKey(source: SourceKey): string {
  return source.toUpperCase().replace(/-/g, '_');
}

export function fromDbSourceKey(db: string): SourceKey {
  return db.toLowerCase().replace(/_/g, '-') as SourceKey;
}
