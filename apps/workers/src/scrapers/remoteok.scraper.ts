import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import type { JsonFetcher } from '../http/http-client';
import { HttpError } from '../http/http-client';
import { isRecord, str, type Scraper } from './scraper';

export const REMOTEOK_API_URL = 'https://remoteok.com/api';
export const REMOTEOK_ATTRIBUTION_NAME = 'Remote OK';
export const REMOTEOK_MAX_TAGS = 10;

/** Hosts (and their subdomains) that are never a company's own domain. */
const EXCLUDED_HOSTS: readonly string[] = [
  'remoteok.com',
  'remoteok.io',
  'greenhouse.io',
  'lever.co',
  'ashbyhq.com',
  'workable.com',
  'smartrecruiters.com',
  'myworkdayjobs.com',
  'workday.com',
  'bamboohr.com',
  'recruitee.com',
  'breezy.hr',
  'jobvite.com',
  'icims.com',
  'teamtailor.com',
  'personio.com',
  'personio.de',
  'rippling.com',
  'jazzhr.com',
  'applytojob.com',
  'linkedin.com',
  'indeed.com',
  'glassdoor.com',
  'ziprecruiter.com',
  'monster.com',
  'weworkremotely.com',
  'angel.co',
  'wellfound.com',
  'google.com',
  'forms.gle',
  'bit.ly',
  'tinyurl.com',
];

function hostOf(rawUrl: string): string | null {
  let url: URL;
  try {
    url = new URL(rawUrl);
  } catch {
    return null;
  }
  if (url.protocol !== 'https:' && url.protocol !== 'http:') return null;
  const host = url.hostname
    .toLowerCase()
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  return host.includes('.') ? host : null;
}

function isCompanyHost(host: string): boolean {
  if (host.startsWith('jobs.')) return false;
  return !EXCLUDED_HOSTS.some((bad) => host === bad || host.endsWith(`.${bad}`));
}

/**
 * Derives a company domain from the first of `urls` whose host is a company host. Returns null
 * for RemoteOK itself, ATS/aggregator hosts, `jobs.*` hosts and unparsable input.
 */
export function deriveCompanyDomain(...urls: Array<unknown>): string | null {
  for (const candidate of urls) {
    const value = str(candidate);
    if (!value) continue;
    const host = hostOf(value);
    if (host && isCompanyHost(host)) return host;
  }
  return null;
}

function salary(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : null;
}

function jobUrlOnRemoteOk(job: Record<string, unknown>, slug: string): string {
  const url = str(job['url']);
  const host = url ? hostOf(url) : null;
  if (url && host === 'remoteok.com') return new URL(url).toString();
  return `https://remoteok.com/remote-jobs/${encodeURIComponent(slug)}`;
}

/**
 * Remote OK public feed: GET https://remoteok.com/api (one request). Element 0 is a legal notice
 * and is skipped. The feed has no company domain, so jobs whose apply/url host is not a company
 * host are skipped and counted in `lastSkippedNoDomain`. Descriptions and logos are never stored;
 * every payload carries the attribution the API terms ask for.
 */
export class RemoteOkScraper implements Scraper {
  readonly source = 'remoteok' as const;
  /** Jobs skipped by the most recent `scrape` because no company domain could be derived. */
  lastSkippedNoDomain = 0;

  constructor(
    private readonly getJson: JsonFetcher,
    private readonly apiUrl: string = REMOTEOK_API_URL,
  ) {}

  async scrape(_target: CompanyTarget): Promise<RawSignalItem[]> {
    const body = await this.getJson(this.apiUrl);
    if (!Array.isArray(body)) {
      throw new HttpError('Unexpected Remote OK response shape', 502);
    }
    this.lastSkippedNoDomain = 0;
    const items: RawSignalItem[] = [];
    for (const job of (body as unknown[]).slice(1)) {
      if (!isRecord(job)) continue;
      const id = str(job['id']) ?? (typeof job['id'] === 'number' ? String(job['id']) : null);
      const slug = str(job['slug']);
      const title = str(job['position']);
      const name = str(job['company']);
      const epoch = job['epoch'];
      if (!id || !slug || !title || !name || typeof epoch !== 'number' || !Number.isFinite(epoch)) {
        continue;
      }
      const domain = deriveCompanyDomain(job['apply_url'], job['url']);
      if (!domain) {
        this.lastSkippedNoDomain += 1;
        continue;
      }
      const url = jobUrlOnRemoteOk(job, slug);
      const tags = Array.isArray(job['tags'])
        ? (job['tags'] as unknown[])
            .map(str)
            .filter((t): t is string => t !== null)
            .slice(0, REMOTEOK_MAX_TAGS)
        : [];
      items.push({
        company: { name, domain },
        signal: {
          type: 'hiring',
          externalId: `remoteok:${id}`,
          detectedAt: new Date(epoch * 1000).toISOString(),
          payload: {
            title,
            location: str(job['location']),
            tags,
            salaryMin: salary(job['salary_min']),
            salaryMax: salary(job['salary_max']),
            url,
            attribution: { name: REMOTEOK_ATTRIBUTION_NAME, url },
          },
        },
      });
    }
    return items;
  }
}
