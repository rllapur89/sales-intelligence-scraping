export const DEFAULT_USER_AGENT =
  'leads-sales-intelligence/0.1 (+https://github.com/rllapur89/sales-intelligence-scraping)';

export type WebsiteFetcherKind = 'http' | 'playwright';

export interface WorkersEnv {
  nodeEnv: string;
  databaseUrl: string;
  redisUrl: string;
  scraperUserAgent: string;
  companiesConfigPath: string;
  /** GitHub REST token (`GITHUB_TOKEN`); undefined when unset. */
  githubToken?: string;
  /** SEC EDGAR User-Agent with contact info (`SEC_EDGAR_USER_AGENT`); undefined when unset. */
  secEdgarUserAgent?: string;
  /** Page fetcher of the website source: `WEBSITE_FETCHER=playwright` renders in Chromium. */
  websiteFetcher: WebsiteFetcherKind;
}

function required(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

function optional(raw: Record<string, unknown>, key: string): string | undefined {
  const value = raw[key];
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : undefined;
}

export function validateEnv(raw: Record<string, unknown>): WorkersEnv {
  const fetcher = optional(raw, 'WEBSITE_FETCHER')?.toLowerCase() ?? 'http';
  if (fetcher !== 'http' && fetcher !== 'playwright') {
    throw new Error(`Invalid WEBSITE_FETCHER "${fetcher}": expected "http" or "playwright"`);
  }
  return {
    nodeEnv: typeof raw['NODE_ENV'] === 'string' ? raw['NODE_ENV'] : 'development',
    databaseUrl: required(raw, 'DATABASE_URL'),
    redisUrl: required(raw, 'REDIS_URL'),
    scraperUserAgent:
      typeof raw['SCRAPER_USER_AGENT'] === 'string' && raw['SCRAPER_USER_AGENT'].trim() !== ''
        ? raw['SCRAPER_USER_AGENT']
        : DEFAULT_USER_AGENT,
    companiesConfigPath:
      typeof raw['SCRAPER_COMPANIES_CONFIG'] === 'string' && raw['SCRAPER_COMPANIES_CONFIG'] !== ''
        ? raw['SCRAPER_COMPANIES_CONFIG']
        : 'apps/workers/config/companies.json',
    githubToken: optional(raw, 'GITHUB_TOKEN'),
    secEdgarUserAgent: optional(raw, 'SEC_EDGAR_USER_AGENT'),
    websiteFetcher: fetcher,
  };
}
