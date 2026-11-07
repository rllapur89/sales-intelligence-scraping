import { describe, expect, it, vi } from 'vitest';
import { SOURCE_KEYS, SOURCE_POLICIES, type CompanyTarget, type SourceKey } from '@leads/shared';
import { validateEnv } from '../config/env';
import { HttpError } from '../http/http-client';
import type { CompaniesConfig } from '../scrapers/companies-config';
import {
  REMOTEOK_FEED_TARGET,
  SEC_BLOCK_PAUSE_MS,
  buildScrapers,
  createSecFetcher,
  decideSources,
  resolveTargets,
  type CompanyRow,
} from './source-registry';

const t = (slug: string, extra: Partial<CompanyTarget> = {}): CompanyTarget => ({
  slug,
  name: slug.toUpperCase(),
  domain: `${slug}.com`,
  ...extra,
});

const config: CompaniesConfig = {
  greenhouse: [
    t('stripe', { githubOrg: 'stripe', secTicker: null }),
    t('airbnb', { githubOrg: 'airbnb', secTicker: 'ABNB' }),
    t('plain'),
  ],
  lever: [t('palantir', { secTicker: 'PLTR' }), t('stripe-lever', { githubOrg: 'Stripe' })],
};
const rows: CompanyRow[] = [
  { name: 'Acme', domain: 'acme.com', industry: 'SaaS', region: 'US' },
  { name: 'Beta', domain: 'beta.io', industry: null, region: null },
];
const sources = { config, loadCompanyRows: vi.fn(async () => rows) };

describe('decideSources', () => {
  const byKey = (env: Record<string, string | undefined>): Record<string, string> =>
    Object.fromEntries(
      decideSources(env).map((d) => [d.source, d.start ? 'start' : (d.reason ?? '')]),
    );

  it('skips unreviewed sources and sources with missing env, with a reason', () => {
    const d = byKey({});
    expect(d['greenhouse']).toBe('start');
    expect(d['lever']).toBe('start');
    expect(d['remoteok']).toBe('start');
    expect(d['website']).toBe('start');
    expect(d['hn-hiring']).toContain('not reviewed');
    expect(d['github']).toContain('GITHUB_TOKEN');
    expect(d['sec-edgar']).toContain('SEC_EDGAR_USER_AGENT');
  });

  it('starts token sources once their variables are set (blank counts as unset)', () => {
    const d = byKey({ GITHUB_TOKEN: 'x', SEC_EDGAR_USER_AGENT: '   ' });
    expect(d['github']).toBe('start');
    expect(d['sec-edgar']).toContain('SEC_EDGAR_USER_AGENT');
    expect(byKey({ SEC_EDGAR_USER_AGENT: 'A a@b.co' })['sec-edgar']).toBe('start');
  });

  it('covers every source key exactly once and never starts hn-hiring', () => {
    const all = decideSources({ GITHUB_TOKEN: 'x', SEC_EDGAR_USER_AGENT: 'x' });
    expect(all.map((d) => d.source)).toEqual([...SOURCE_KEYS]);
    expect(all.find((d) => d.source === 'hn-hiring')?.start).toBe(false);
    expect(all.filter((d) => d.start).map((d) => d.source)).toEqual([
      'greenhouse',
      'lever',
      'remoteok',
      'github',
      'sec-edgar',
      'website',
    ]);
  });

  it('honors custom policies', () => {
    const policies = {
      ...SOURCE_POLICIES,
      lever: { ...SOURCE_POLICIES.lever, requiredEnv: ['A', 'B'] },
    };
    const d = decideSources({ A: '1' }, policies, ['lever']);
    expect(d).toEqual([
      { source: 'lever', start: false, reason: 'missing environment variable B' },
    ]);
  });
});

describe('resolveTargets', () => {
  const slugsOf = async (source: SourceKey, filter?: string[]): Promise<string[]> =>
    (await resolveTargets(source, sources, filter)).map((x) => x.slug);

  it('greenhouse and lever are unchanged config lists, with the slug filter', async () => {
    expect(await slugsOf('greenhouse')).toEqual(['stripe', 'airbnb', 'plain']);
    expect(await slugsOf('lever')).toEqual(['palantir', 'stripe-lever']);
    expect(await slugsOf('greenhouse', ['airbnb', 'nope'])).toEqual(['airbnb']);
    expect(await slugsOf('greenhouse', [])).toEqual(['stripe', 'airbnb', 'plain']);
  });

  it('github: companies with githubOrg, deduped by org (case-insensitive)', async () => {
    expect(await slugsOf('github')).toEqual(['stripe', 'airbnb']);
    expect(await slugsOf('github', ['airbnb'])).toEqual(['airbnb']);
  });

  it('sec-edgar: companies with secTicker', async () => {
    expect(await slugsOf('sec-edgar')).toEqual(['airbnb', 'palantir']);
  });

  it('remoteok: one synthetic feed target', async () => {
    expect(await resolveTargets('remoteok', sources)).toEqual([REMOTEOK_FEED_TARGET]);
    expect(REMOTEOK_FEED_TARGET).toEqual({
      slug: 'feed',
      name: 'Remote OK',
      domain: 'remoteok.com',
    });
    expect(await slugsOf('remoteok', ['other'])).toEqual([]);
  });

  it('website: Company rows with slug = domain and an optional slug filter', async () => {
    const all = await resolveTargets('website', sources);
    expect(all).toEqual([
      { slug: 'acme.com', name: 'Acme', domain: 'acme.com', industry: 'SaaS', region: 'US' },
      { slug: 'beta.io', name: 'Beta', domain: 'beta.io', industry: null, region: null },
    ]);
    expect(await slugsOf('website', ['beta.io'])).toEqual(['beta.io']);
  });

  it('only reads the Company table for the website source', async () => {
    sources.loadCompanyRows.mockClear();
    await resolveTargets('github', sources);
    await resolveTargets('remoteok', sources);
    expect(sources.loadCompanyRows).not.toHaveBeenCalled();
  });

  it('returns nothing for unreviewed sources', async () => {
    expect(await slugsOf('hn-hiring')).toEqual([]);
  });
});

describe('createSecFetcher', () => {
  const ua = 'Acme Research admin@example.com';

  it('sends the contact User-Agent and Accept-Encoding gzip, deflate', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(new Response('{"ok":true}', { status: 200 }));
    expect(await createSecFetcher(ua, fetchImpl)('https://data.sec.gov/x')).toEqual({ ok: true });
    const headers = (fetchImpl.mock.calls[0]![1] as RequestInit).headers as Record<string, string>;
    expect(headers['User-Agent']).toBe(ua);
    expect(headers['Accept-Encoding']).toBe('gzip, deflate');
  });

  it.each([403, 429])(
    'turns %i into a rate-limited error pausing >= 10 minutes',
    async (status) => {
      const fetchImpl = vi.fn().mockResolvedValue(new Response('', { status }));
      const err = await createSecFetcher(
        ua,
        fetchImpl,
      )('https://data.sec.gov/x').catch((e: unknown) => e);
      expect(err).toBeInstanceOf(HttpError);
      expect(err).toMatchObject({ status, rateLimited: true, retryable: true });
      expect((err as HttpError).retryAfterMs).toBeGreaterThanOrEqual(600_000);
      expect(SEC_BLOCK_PAUSE_MS).toBe(600_000);
    },
  );

  it('keeps a longer server Retry-After and leaves other errors untouched', async () => {
    const long = vi
      .fn()
      .mockResolvedValue(new Response('', { status: 429, headers: { 'retry-after': '3600' } }));
    const e1 = await createSecFetcher(ua, long)('https://x.test').catch((e: unknown) => e);
    expect((e1 as HttpError).retryAfterMs).toBe(3_600_000);
    const nf = vi.fn().mockResolvedValue(new Response('', { status: 404 }));
    const e2 = await createSecFetcher(ua, nf)('https://x.test').catch((e: unknown) => e);
    expect(e2).toMatchObject({ status: 404, rateLimited: false });
    expect((e2 as HttpError).retryAfterMs).toBeUndefined();
  });
});

describe('buildScrapers', () => {
  const base = { DATABASE_URL: 'postgresql://x', REDIS_URL: 'redis://x' };

  it('registers the always-on scrapers and omits token sources without their variable', () => {
    const keys = [...buildScrapers(validateEnv(base)).keys()].sort();
    expect(keys).toEqual(['greenhouse', 'lever', 'remoteok', 'website']);
  });

  it('registers github and sec-edgar when configured, each with its own source key', () => {
    const map = buildScrapers(
      validateEnv({ ...base, GITHUB_TOKEN: 'tok', SEC_EDGAR_USER_AGENT: 'Acme a@b.co' }),
    );
    expect([...map.keys()].sort()).toEqual([
      'github',
      'greenhouse',
      'lever',
      'remoteok',
      'sec-edgar',
      'website',
    ]);
    for (const [key, scraper] of map) expect(scraper.source).toBe(key);
  });

  it('builds the website scraper for WEBSITE_FETCHER=playwright without loading playwright', () => {
    const map = buildScrapers(validateEnv({ ...base, WEBSITE_FETCHER: 'playwright' }));
    expect(map.get('website')?.source).toBe('website');
  });
});
