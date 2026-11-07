import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyTarget } from '@leads/shared';
import { HttpError } from '../http/http-client';
import { nameMatches, padCik, SEC_TICKERS_URL, SecEdgarScraper } from './sec-edgar.scraper';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../test/fixtures', name), 'utf8'));

const NOW = new Date('2026-11-07T12:00:00Z');
const SUBMISSIONS = 'https://data.sec.gov/submissions/CIK0001477333.json';

const cloudflare: CompanyTarget = {
  slug: 'cloudflare',
  name: 'Cloudflare',
  domain: 'cloudflare.com',
  industry: 'Network',
  region: 'US',
  secTicker: 'NET',
};

function setup(overrides: Record<string, unknown> = {}, now: () => Date = () => NOW) {
  const getJson = vi.fn(async (url: string) => {
    if (url in overrides) {
      const v = overrides[url];
      if (v instanceof Error) throw v;
      return v;
    }
    if (url === SEC_TICKERS_URL) return fixture('sec-company-tickers.json');
    if (url === SUBMISSIONS) return fixture('sec-submissions-cloudflare.json');
    throw new Error(`unexpected url ${url}`);
  });
  return { getJson, scraper: new SecEdgarScraper({ getJson, now }) };
}

describe('SecEdgarScraper', () => {
  it('maps allowlisted filings of the last 90 days with the exact payload', async () => {
    const { scraper } = setup();
    const items = await scraper.scrape(cloudflare);
    expect(items.map((i) => i.signal.payload['form'])).toEqual(['10-Q', '8-K', '424B4']);
    expect(items[0]).toEqual({
      company: { name: 'Cloudflare', domain: 'cloudflare.com', industry: 'Network', region: 'US' },
      signal: {
        type: 'filing',
        externalId: 'sec:1477333:0001477333-26-000050',
        detectedAt: '2026-11-03T00:00:00.000Z',
        payload: {
          form: '10-Q',
          filingDate: '2026-11-03',
          url: 'https://www.sec.gov/Archives/edgar/data/1477333/000147733326000050/net-20260930.htm',
        },
      },
    });
    expect(Object.keys(items[0]!.signal.payload).sort()).toEqual(['filingDate', 'form', 'url']);
  });

  it('ignores insider forms and filings older than 90 days', async () => {
    const { scraper } = setup();
    const items = await scraper.scrape(cloudflare);
    const forms = items.map((i) => i.signal.payload['form']);
    expect(forms).not.toContain('4');
    expect(forms).not.toContain('SC 13G');
    // 10-K of 2026-08-01 and 8-K of 2026-07-30 are outside the window (cutoff 2026-08-09).
    expect(items.map((i) => i.signal.payload['filingDate'])).toEqual([
      '2026-11-03',
      '2026-10-20',
      '2026-08-30',
    ]);
  });

  it('pads the CIK to 10 digits in the submissions URL', async () => {
    const { scraper, getJson } = setup();
    await scraper.scrape(cloudflare);
    expect(getJson).toHaveBeenCalledWith(SUBMISSIONS);
    expect(padCik(320193)).toBe('0000320193');
    expect(padCik('0000320193')).toBe('0000320193');
  });

  it('fetches the ticker map once and reuses it for 24 hours', async () => {
    let current = NOW;
    const { scraper, getJson } = setup({}, () => current);
    await scraper.scrape(cloudflare);
    await scraper.scrape(cloudflare);
    const tickerCalls = () => getJson.mock.calls.filter(([u]) => u === SEC_TICKERS_URL).length;
    expect(tickerCalls()).toBe(1);
    current = new Date(NOW.getTime() + 23 * 3_600_000);
    await scraper.scrape(cloudflare);
    expect(tickerCalls()).toBe(1);
    current = new Date(NOW.getTime() + 25 * 3_600_000);
    await scraper.scrape(cloudflare);
    expect(tickerCalls()).toBe(2);
  });

  it('does not cache a failed ticker map fetch', async () => {
    let fail = true;
    const getJson = vi.fn(async (url: string) => {
      if (url === SEC_TICKERS_URL) {
        if (fail) throw new HttpError('boom', 500);
        return fixture('sec-company-tickers.json');
      }
      return fixture('sec-submissions-cloudflare.json');
    });
    const scraper = new SecEdgarScraper({ getJson, now: () => NOW });
    await expect(scraper.scrape(cloudflare)).rejects.toThrow('boom');
    fail = false;
    expect(await scraper.scrape(cloudflare)).toHaveLength(3);
  });

  it('skips with a non-retryable 422 when the EDGAR title does not match the name', async () => {
    const { scraper, getJson } = setup();
    const err = await scraper.scrape({ ...cloudflare, name: 'Google', secTicker: 'GOOGL' }).then(
      () => null,
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpError);
    const http = err as HttpError;
    expect(http.status).toBe(422);
    expect(http.retryable).toBe(false);
    expect(http.message).toContain('Alphabet Inc.');
    expect(http.message).toContain('Google');
    expect(getJson.mock.calls.some(([u]) => u.includes('/submissions/'))).toBe(false);
  });

  it('throws a non-retryable 422 for an unknown ticker', async () => {
    const { scraper } = setup();
    await expect(scraper.scrape({ ...cloudflare, secTicker: 'NOPE' })).rejects.toMatchObject({
      status: 422,
    });
  });

  it('requires secTicker', async () => {
    const { scraper } = setup();
    await expect(scraper.scrape({ ...cloudflare, secTicker: null })).rejects.toThrow('secTicker');
  });

  it('lets 403/429 propagate untouched', async () => {
    const limited = new HttpError('HTTP 429', 429, 600_000, true);
    const { scraper } = setup({ [SUBMISSIONS]: limited });
    await expect(scraper.scrape(cloudflare)).rejects.toBe(limited);
    const forbidden = new HttpError('HTTP 403', 403, undefined, true);
    const second = setup({ [SEC_TICKERS_URL]: forbidden });
    await expect(second.scraper.scrape(cloudflare)).rejects.toBe(forbidden);
  });

  it('rejects an unexpected submissions shape with 502', async () => {
    const { scraper } = setup({ [SUBMISSIONS]: { filings: {} } });
    await expect(scraper.scrape(cloudflare)).rejects.toMatchObject({ status: 502 });
  });
});

describe('nameMatches', () => {
  it('matches loosely on the first significant token', () => {
    expect(nameMatches('Cloudflare', 'Cloudflare, Inc.')).toBe(true);
    expect(nameMatches('The Elastic Company', 'Elastic N.V.')).toBe(true);
    expect(nameMatches('Apple', 'Apple Inc.')).toBe(true);
  });
  it('rejects different companies', () => {
    expect(nameMatches('Google', 'Alphabet Inc.')).toBe(false);
    expect(nameMatches('Stripe', 'Apple Inc.')).toBe(false);
    expect(nameMatches('', 'Apple Inc.')).toBe(false);
  });
});
