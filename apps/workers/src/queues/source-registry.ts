import {
  SOURCE_KEYS,
  SOURCE_POLICIES,
  type CompanyTarget,
  type SourceKey,
  type SourcePolicy,
} from '@leads/shared';
import type { WorkersEnv } from '../config/env';
import { HttpError, createJsonFetcher, type JsonFetcher } from '../http/http-client';
import type { CompaniesConfig } from '../scrapers/companies-config';
import { GithubScraper } from '../scrapers/github.scraper';
import { GreenhouseScraper } from '../scrapers/greenhouse.scraper';
import { LeverScraper } from '../scrapers/lever.scraper';
import { RemoteOkScraper } from '../scrapers/remoteok.scraper';
import type { Scraper } from '../scrapers/scraper';
import { SecEdgarScraper } from '../scrapers/sec-edgar.scraper';
import { HttpPageFetcher, PlaywrightPageFetcher } from '../scrapers/website/page-fetcher';
import { WebsiteScraper } from '../scrapers/website/website.scraper';

/** SEC asks us to back off hard when it blocks us: at least 10 minutes. */
export const SEC_BLOCK_PAUSE_MS = 10 * 60 * 1000;

export const REMOTEOK_FEED_TARGET: CompanyTarget = {
  slug: 'feed',
  name: 'Remote OK',
  domain: 'remoteok.com',
};

export interface SourceDecision {
  source: SourceKey;
  start: boolean;
  /** Why the source is not started; set only when `start` is false. */
  reason?: string;
}

/**
 * A source starts only when its terms/limits were reviewed AND every required environment variable
 * is set (non-blank). Order follows `sources`; each skipped source carries the reason to log.
 */
export function decideSources(
  env: Readonly<Record<string, string | undefined>>,
  policies: Readonly<Record<SourceKey, SourcePolicy>> = SOURCE_POLICIES,
  sources: readonly SourceKey[] = SOURCE_KEYS,
): SourceDecision[] {
  return sources.map((source) => {
    const policy = policies[source];
    if (!policy.reviewed) {
      return { source, start: false, reason: 'terms/limits not reviewed yet' };
    }
    const missing = policy.requiredEnv.filter((name) => !env[name]?.trim());
    if (missing.length > 0) {
      return { source, start: false, reason: `missing environment variable ${missing.join(', ')}` };
    }
    return { source, start: true };
  });
}

/** Company row as stored in Postgres; the website source scrapes these domains. */
export interface CompanyRow {
  name: string;
  domain: string;
  industry: string | null;
  region: string | null;
}

export interface TargetSources {
  config: CompaniesConfig;
  /** Reads the Company table (website source only). */
  loadCompanyRows: () => Promise<CompanyRow[]>;
}

function uniqueBy(
  targets: CompanyTarget[],
  key: (t: CompanyTarget) => string | null | undefined,
): CompanyTarget[] {
  const seenKeys = new Set<string>();
  const seenSlugs = new Set<string>();
  const out: CompanyTarget[] = [];
  for (const t of targets) {
    const k = key(t)?.trim().toLowerCase();
    if (!k || seenKeys.has(k) || seenSlugs.has(t.slug)) continue;
    seenKeys.add(k);
    seenSlugs.add(t.slug);
    out.push(t);
  }
  return out;
}

/** The targets of one source; `slugs` (when non-empty) keeps only matching target slugs. */
export async function resolveTargets(
  source: SourceKey,
  sources: TargetSources,
  slugs?: readonly string[],
): Promise<CompanyTarget[]> {
  const { config } = sources;
  const configured = [...config.greenhouse, ...config.lever];
  let list: CompanyTarget[];
  switch (source) {
    case 'greenhouse':
      list = config.greenhouse;
      break;
    case 'lever':
      list = config.lever;
      break;
    case 'github':
      list = uniqueBy(configured, (t) => t.githubOrg);
      break;
    case 'sec-edgar':
      list = uniqueBy(configured, (t) => t.secTicker);
      break;
    case 'remoteok':
      list = [REMOTEOK_FEED_TARGET];
      break;
    case 'website': {
      const rows = await sources.loadCompanyRows();
      list = uniqueBy(
        rows.map((r) => ({
          slug: r.domain,
          name: r.name,
          domain: r.domain,
          industry: r.industry,
          region: r.region,
        })),
        (t) => t.slug,
      );
      break;
    }
    default:
      list = [];
  }
  return slugs && slugs.length > 0 ? list.filter((t) => slugs.includes(t.slug)) : list;
}

/**
 * SEC JSON fetcher: sends the contact User-Agent and `Accept-Encoding: gzip, deflate`; a 403/429
 * becomes a rate-limited HttpError whose `retryAfterMs` is at least 10 minutes, which makes the task
 * handler pause the whole queue for that long.
 */
export function createSecFetcher(
  userAgent: string,
  fetchImpl?: typeof fetch,
  now?: () => number,
): JsonFetcher {
  const inner = createJsonFetcher({
    userAgent,
    headers: { 'Accept-Encoding': 'gzip, deflate' },
    fetchImpl,
    now,
  });
  return async (url) => {
    try {
      return await inner(url);
    } catch (err) {
      if (err instanceof HttpError && (err.status === 403 || err.status === 429)) {
        throw new HttpError(
          err.message,
          err.status,
          Math.max(err.retryAfterMs ?? 0, SEC_BLOCK_PAUSE_MS),
          true,
        );
      }
      throw err;
    }
  };
}

export interface ScraperHooks {
  /** Receives the reason whenever the website scraper skips a company on purpose. */
  onWebsiteSkip?: (reason: string, target: CompanyTarget) => void;
}

/**
 * Builds every scraper that can run with this environment. Token-based sources are registered only
 * when their variable is set; the SEC scraper owns one cached ticker -> CIK map for the process.
 */
export function buildScrapers(env: WorkersEnv, hooks: ScraperHooks = {}): Map<SourceKey, Scraper> {
  const fetchJson = createJsonFetcher({ userAgent: env.scraperUserAgent });
  const scrapers = new Map<SourceKey, Scraper>([
    ['greenhouse', new GreenhouseScraper(fetchJson)],
    ['lever', new LeverScraper(fetchJson)],
    ['remoteok', new RemoteOkScraper(fetchJson)],
    [
      'website',
      new WebsiteScraper({
        pageFetcher:
          env.websiteFetcher === 'playwright' ? new PlaywrightPageFetcher() : new HttpPageFetcher(),
        onSkip: hooks.onWebsiteSkip,
      }),
    ],
  ]);
  if (env.githubToken) {
    scrapers.set(
      'github',
      new GithubScraper({ token: env.githubToken, userAgent: env.scraperUserAgent }),
    );
  }
  if (env.secEdgarUserAgent) {
    scrapers.set(
      'sec-edgar',
      new SecEdgarScraper({ getJson: createSecFetcher(env.secEdgarUserAgent) }),
    );
  }
  return scrapers;
}
