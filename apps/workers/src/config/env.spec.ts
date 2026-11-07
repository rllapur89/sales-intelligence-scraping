import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

describe('workers validateEnv', () => {
  it('requires REDIS_URL', () => {
    expect(() => validateEnv({ DATABASE_URL: 'postgresql://x' })).toThrow('REDIS_URL');
  });

  it('accepts a complete environment', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' });
    expect(env.redisUrl).toBe('redis://x');
  });
  it('defaults the user agent and companies config path', () => {
    const env = validateEnv({ DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' });
    expect(env.scraperUserAgent).toContain('leads-sales-intelligence');
    expect(env.companiesConfigPath).toBe('apps/workers/config/companies.json');
  });
});

describe('workers validateEnv (scraper variables)', () => {
  const base = { DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' };

  it('defaults the website fetcher to http and leaves tokens undefined', () => {
    const env = validateEnv(base);
    expect(env.websiteFetcher).toBe('http');
    expect(env.githubToken).toBeUndefined();
    expect(env.secEdgarUserAgent).toBeUndefined();
  });

  it('reads WEBSITE_FETCHER, GITHUB_TOKEN and SEC_EDGAR_USER_AGENT (blank counts as unset)', () => {
    const env = validateEnv({
      ...base,
      WEBSITE_FETCHER: 'Playwright',
      GITHUB_TOKEN: ' tok ',
      SEC_EDGAR_USER_AGENT: 'Acme admin@example.com',
    });
    expect(env.websiteFetcher).toBe('playwright');
    expect(env.githubToken).toBe('tok');
    expect(env.secEdgarUserAgent).toBe('Acme admin@example.com');
    expect(
      validateEnv({ ...base, GITHUB_TOKEN: '  ', WEBSITE_FETCHER: '' }).githubToken,
    ).toBeUndefined();
  });

  it('rejects an unknown WEBSITE_FETCHER', () => {
    expect(() => validateEnv({ ...base, WEBSITE_FETCHER: 'puppeteer' })).toThrow('WEBSITE_FETCHER');
  });
});
