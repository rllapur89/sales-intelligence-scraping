import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import { HttpError } from '../../http/http-client';
import type { Scraper } from '../scraper';
import { detectTech, extractMeta } from './detect-tech';
import { HttpPageFetcher, type PageFetcher } from './page-fetcher';
import { RobotsChecker } from './robots';

export const DESCRIPTION_MAX_CHARS = 300;
const MAX_CRAWL_DELAY_MS = 60_000;

export interface WebsiteScraperOptions {
  pageFetcher?: PageFetcher;
  /** Defaults to a checker backed by a plain {@link HttpPageFetcher}. */
  robots?: RobotsChecker;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  /** Called with a descriptive reason whenever a target is skipped without error. */
  onSkip?: (reason: string, target: CompanyTarget) => void;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function normalizeDomain(domain: string): string {
  return domain
    .trim()
    .toLowerCase()
    .replace(/^[a-z]+:\/\//, '')
    .replace(/[/?#].*$/, '');
}

function truncate(text: string, max: number): string {
  return text.length <= max ? text : `${text.slice(0, max - 1).trimEnd()}…`;
}

/**
 * Website enrichment (RFC 9309): robots.txt first, then exactly one home-page fetch. Emits one
 * `website-tech` signal per company and month with description and tech hints. When the site is
 * disallowed or robots.txt is unreachable it returns `[]` and sets {@link lastSkipReason}.
 */
export class WebsiteScraper implements Scraper {
  readonly source = 'website' as const;
  /** Why the last `scrape()` returned nothing on purpose; `null` when it did not skip. */
  lastSkipReason: string | null = null;
  private readonly pageFetcher: PageFetcher;
  private readonly robots: RobotsChecker;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly onSkip?: (reason: string, target: CompanyTarget) => void;

  constructor(options: WebsiteScraperOptions = {}) {
    this.pageFetcher = options.pageFetcher ?? new HttpPageFetcher();
    this.robots = options.robots ?? new RobotsChecker({ fetcher: new HttpPageFetcher() });
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
    this.onSkip = options.onSkip;
  }

  async scrape(target: CompanyTarget): Promise<RawSignalItem[]> {
    this.lastSkipReason = null;
    const domain = normalizeDomain(target.domain);
    if (domain === '') throw new Error(`No domain for ${target.slug}`);

    const policy = await this.robots.getPolicy(domain);
    if (!(await this.robots.isAllowed(domain, '/'))) {
      return this.skip(target, `robotsDisallowed: ${domain} (${policy.reason})`);
    }
    if (policy.crawlDelaySec) {
      await this.sleep(Math.min(policy.crawlDelaySec * 1000, MAX_CRAWL_DELAY_MS));
    }

    const page = await this.pageFetcher.fetchPage(`https://${domain}/`);
    if (page.status < 200 || page.status >= 300) {
      throw new HttpError(`HTTP ${page.status} for https://${domain}/`, page.status);
    }

    // A redirect to another host is subject to that host's robots.txt.
    let finalHost = domain;
    let finalPath = '/';
    try {
      const final = new URL(page.finalUrl);
      finalHost = final.hostname.toLowerCase();
      finalPath = `${final.pathname}${final.search}`;
    } catch {
      // keep the requested host
    }
    if (finalHost !== domain && !(await this.robots.isAllowed(finalHost, finalPath))) {
      return this.skip(target, `robotsDisallowed: redirect target ${finalHost}${finalPath}`);
    }

    const meta = extractMeta(page.body);
    const techHints = detectTech(page.body, page.headers);
    const rawDescription = meta.description ?? meta.ogDescription;
    const description = rawDescription ? truncate(rawDescription, DESCRIPTION_MAX_CHARS) : null;
    const now = this.now();
    const month = now.toISOString().slice(0, 7);

    return [
      {
        company: {
          name: target.name,
          domain,
          industry: target.industry,
          region: target.region,
          description,
          techHints,
        },
        signal: {
          type: 'website-tech',
          externalId: `web:${domain}:${month}`,
          detectedAt: now.toISOString(),
          payload: {
            url: page.finalUrl,
            title: meta.title,
            generator: meta.generator,
            server: page.headers['server'] ?? null,
            poweredBy: page.headers['x-powered-by'] ?? null,
            techHints,
          },
        },
      },
    ];
  }

  private skip(target: CompanyTarget, reason: string): RawSignalItem[] {
    this.lastSkipReason = reason;
    this.onSkip?.(reason, target);
    return [];
  }
}
