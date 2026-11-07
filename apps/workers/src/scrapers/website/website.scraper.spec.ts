import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyTarget } from '@leads/shared';
import { HttpError } from '../../http/http-client';
import type { FetchedPage, PageFetcher } from './page-fetcher';
import { RobotsChecker } from './robots';
import { WebsiteScraper } from './website.scraper';

const html = (name: string): string =>
  readFileSync(join(__dirname, '../../../test/fixtures', name), 'utf8');

const NOW = new Date('2026-11-07T12:00:00Z');
const acme: CompanyTarget = {
  slug: 'acme',
  name: 'Acme',
  domain: 'acme.com',
  industry: 'Software',
  region: 'US',
};

type Responder = (url: string) => FetchedPage | Error;

function setup(responder: Responder, extra: { onSkip?: (r: string) => void } = {}) {
  const urls: string[] = [];
  const fetcher: PageFetcher = {
    fetchPage: vi.fn(async (url: string) => {
      urls.push(url);
      const r = responder(url);
      if (r instanceof Error) throw r;
      return r;
    }),
  };
  const sleep = vi.fn(async () => undefined);
  const scraper = new WebsiteScraper({
    pageFetcher: fetcher,
    robots: new RobotsChecker({ fetcher, now: () => NOW.getTime() }),
    sleep,
    now: () => NOW,
    onSkip: extra.onSkip,
  });
  return { scraper, urls, sleep };
}

const ok = (url: string, body: string, headers: Record<string, string> = {}): FetchedPage => ({
  status: 200,
  headers,
  body,
  finalUrl: url,
});

const routes =
  (robots: FetchedPage, home?: FetchedPage): Responder =>
  (url) =>
    url.endsWith('/robots.txt')
      ? robots
      : (home ?? ok(url, html('website-rich.html'), { server: 'cloudflare' }));

describe('WebsiteScraper', () => {
  it('checks robots first, fetches one home page and emits the signal', async () => {
    const { scraper, urls } = setup(
      routes(ok('https://acme.com/robots.txt', 'User-agent: *\nDisallow: /private\n')),
    );
    const items = await scraper.scrape(acme);
    expect(urls).toEqual(['https://acme.com/robots.txt', 'https://acme.com/']);
    expect(scraper.lastSkipReason).toBeNull();
    expect(items).toHaveLength(1);
    const [item] = items;
    expect(item!.signal).toEqual({
      type: 'website-tech',
      externalId: 'web:acme.com:2026-11',
      detectedAt: '2026-11-07T12:00:00.000Z',
      payload: {
        url: 'https://acme.com/',
        title: 'Acme & Co | Cloud tooling for teams',
        generator: 'WordPress 6.4.2',
        server: 'cloudflare',
        poweredBy: null,
        techHints: [
          'Cloudflare',
          'Google Tag Manager',
          'HubSpot',
          'Intercom',
          'Next.js',
          'Segment',
          'Shopify',
          'WordPress',
        ],
      },
    });
    expect(item!.company).toEqual({
      name: 'Acme',
      domain: 'acme.com',
      industry: 'Software',
      region: 'US',
      description: 'Acme builds cloud tooling for distributed teams.',
      techHints: (item!.signal.payload['techHints'] as string[]).slice(),
    });
  });

  it('truncates the description to 300 characters', async () => {
    const long = `<meta name="description" content="${'a'.repeat(500)}">`;
    const { scraper } = setup(
      routes(ok('x', ''), ok('https://acme.com/', `<html><head>${long}</head></html>`)),
    );
    const [item] = await scraper.scrape(acme);
    expect(item!.company.description).toHaveLength(300);
  });

  it('falls back to og:description and to null', async () => {
    const og = '<meta property="og:description" content="from og">';
    const first = setup(routes(ok('x', ''), ok('https://acme.com/', og)));
    expect((await first.scraper.scrape(acme))[0]!.company.description).toBe('from og');
    const none = setup(routes(ok('x', ''), ok('https://acme.com/', '<html></html>')));
    expect((await none.scraper.scrape(acme))[0]!.company.description).toBeNull();
  });

  it('skips with a descriptive reason when "/" is disallowed', async () => {
    const onSkip = vi.fn();
    const { scraper, urls } = setup(routes(ok('x', 'User-agent: *\nDisallow: /\n')), { onSkip });
    expect(await scraper.scrape(acme)).toEqual([]);
    expect(urls).toEqual(['https://acme.com/robots.txt']);
    expect(scraper.lastSkipReason).toContain('robotsDisallowed');
    expect(scraper.lastSkipReason).toContain('acme.com');
    expect(onSkip).toHaveBeenCalledWith(scraper.lastSkipReason, acme);
  });

  it('crawls when only other paths are disallowed or robots.txt is 404', async () => {
    const notFound: FetchedPage = { status: 404, headers: {}, body: '', finalUrl: 'x' };
    const { scraper, urls } = setup(routes(notFound));
    expect(await scraper.scrape(acme)).toHaveLength(1);
    expect(urls).toHaveLength(2);
  });

  it('returns [] and records the reason when robots.txt answers 5xx', async () => {
    const { scraper, urls } = setup(routes({ status: 503, headers: {}, body: '', finalUrl: 'x' }));
    expect(await scraper.scrape(acme)).toEqual([]);
    expect(urls).toEqual(['https://acme.com/robots.txt']);
    expect(scraper.lastSkipReason).toContain('503');
  });

  it('returns [] when robots.txt is unreachable', async () => {
    const { scraper, urls } = setup((url) =>
      url.endsWith('/robots.txt') ? new HttpError('Network error', 0) : new Error('unreachable'),
    );
    expect(await scraper.scrape(acme)).toEqual([]);
    expect(urls).toHaveLength(1);
    expect(scraper.lastSkipReason).toContain('unreachable');
  });

  it('clears lastSkipReason on the next successful scrape', async () => {
    let disallow = true;
    const { scraper } = setup((url) =>
      url.endsWith('/robots.txt')
        ? ok(url, disallow ? 'User-agent: *\nDisallow: /' : '')
        : ok(url, '<html></html>'),
    );
    await scraper.scrape(acme);
    expect(scraper.lastSkipReason).not.toBeNull();
    disallow = false;
    // robots.txt is cached per host, so use another domain.
    await scraper.scrape({ ...acme, domain: 'other.com' });
    expect(scraper.lastSkipReason).toBeNull();
  });

  it('honors Crawl-delay between robots.txt and the page', async () => {
    const { scraper, sleep } = setup(routes(ok('x', 'User-agent: *\nCrawl-delay: 2\n')));
    await scraper.scrape(acme);
    expect(sleep).toHaveBeenCalledWith(2000);
  });

  it('does not sleep without a Crawl-delay', async () => {
    const { scraper, sleep } = setup(routes(ok('x', '')));
    await scraper.scrape(acme);
    expect(sleep).not.toHaveBeenCalled();
  });

  it('throws an HttpError with the status when the home page fails', async () => {
    const { scraper } = setup(
      routes(ok('x', ''), { status: 500, headers: {}, body: '', finalUrl: 'https://acme.com/' }),
    );
    await expect(scraper.scrape(acme)).rejects.toMatchObject({ status: 500 });
  });

  it('checks the robots.txt of a redirect target on another host', async () => {
    const { scraper, urls } = setup((url) => {
      if (url === 'https://acme.com/robots.txt') return ok(url, '');
      if (url === 'https://acme.com/') return ok('https://www.acme.io/en', '<html></html>');
      if (url === 'https://www.acme.io/robots.txt') return ok(url, 'User-agent: *\nDisallow: /en');
      throw new Error(`unexpected ${url}`);
    });
    expect(await scraper.scrape(acme)).toEqual([]);
    expect(urls).toContain('https://www.acme.io/robots.txt');
    expect(scraper.lastSkipReason).toContain('redirect target');
  });

  it('normalizes the domain (scheme, case, path)', async () => {
    const { scraper, urls } = setup(routes(ok('x', '')));
    const [item] = await scraper.scrape({ ...acme, domain: 'HTTPS://Acme.com/about' });
    expect(urls[0]).toBe('https://acme.com/robots.txt');
    expect(item!.signal.externalId).toBe('web:acme.com:2026-11');
  });
});
