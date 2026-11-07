import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyTarget } from '@leads/shared';
import { HttpError } from '../http/http-client';
import { GithubScraper } from './github.scraper';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../test/fixtures', name), 'utf8'));

const vercel: CompanyTarget = {
  slug: 'vercel',
  name: 'Vercel',
  domain: 'vercel.com',
  industry: 'Cloud',
  region: 'US',
  githubOrg: 'vercel',
};

const REPOS =
  'https://api.github.com/orgs/vercel/repos?type=public&sort=created&direction=desc&per_page=30';
const NOW = new Date('2026-11-07T12:00:00Z');

function setup(overrides: Record<string, unknown> = {}) {
  const calls: string[] = [];
  const events: string[] = [];
  const getJson = vi.fn(async (url: string) => {
    calls.push(url);
    events.push(`get`);
    if (url in overrides) {
      const v = overrides[url];
      if (v instanceof Error) throw v;
      return v;
    }
    if (url === REPOS) return fixture('github-vercel-repos.json');
    return fixture('github-nextjs-releases.json');
  });
  const sleep = vi.fn(async (ms: number) => {
    events.push(`sleep:${ms}`);
  });
  const scraper = new GithubScraper({
    token: 'secret-token',
    userAgent: 'test-agent',
    getJson,
    sleep,
    now: () => NOW,
  });
  return { scraper, calls, events, getJson, sleep };
}

describe('GithubScraper (recorded fixtures, no network)', () => {
  it('emits new-repo and release signals with stable external ids', async () => {
    const { scraper } = setup();
    const items = await scraper.scrape(vercel);
    const ids = items.map((i) => i.signal.externalId);
    expect(ids).toContain('gh:vercel:repo:vercel/marketplace-skills');
    expect(ids).toContain('gh:vercel:release:vercel/academy-starters:v16.5.0-canary.43');
    expect(items.every((i) => i.signal.type === 'oss-activity')).toBe(true);
    expect(items).toHaveLength(5 + 3 * 3);
    expect(new Set(ids).size).toBe(ids.length);
    const repo = items.find((i) => i.signal.externalId.includes(':repo:vercel/marketplace-skills'));
    expect(repo!.signal.detectedAt).toBe('2026-11-01T01:47:23.000Z');
    expect(repo!.signal.payload).toMatchObject({
      kind: 'new-repo',
      fullName: 'vercel/marketplace-skills',
      language: null,
      stars: 0,
      url: 'https://github.com/vercel/marketplace-skills',
    });
    expect(repo!.company).toMatchObject({ name: 'Vercel', domain: 'vercel.com' });
  });

  it('makes 1 repos request + 3 release requests for the most recently pushed repos', async () => {
    const { scraper, calls } = setup();
    await scraper.scrape(vercel);
    expect(calls).toEqual([
      REPOS,
      'https://api.github.com/repos/vercel/academy-starters/releases?per_page=5',
      'https://api.github.com/repos/vercel/marketplace-skills/releases?per_page=5',
      'https://api.github.com/repos/vercel/academy-nextjs-foundations/releases?per_page=5',
    ]);
  });

  it('spaces requests by at least 250 ms, sequentially, never sleeping before the first', async () => {
    const { scraper, events } = setup();
    await scraper.scrape(vercel);
    expect(events).toEqual(['get', 'sleep:250', 'get', 'sleep:250', 'get', 'sleep:250', 'get']);
  });

  it('never goes below 250 ms spacing even when configured lower', async () => {
    const sleep = vi.fn().mockResolvedValue(undefined);
    const scraper = new GithubScraper({
      token: 't',
      userAgent: 'ua',
      getJson: vi.fn().mockResolvedValue([]),
      sleep,
      spacingMs: 10,
      now: () => NOW,
    });
    await scraper.scrape(vercel);
    expect(sleep).not.toHaveBeenCalled(); // no repos => no further requests
    const withRepos = new GithubScraper({
      token: 't',
      userAgent: 'ua',
      getJson: vi.fn().mockResolvedValue(fixture('github-vercel-repos.json')),
      sleep,
      spacingMs: 10,
      now: () => NOW,
    });
    await withRepos.scrape(vercel);
    expect(sleep).toHaveBeenCalledWith(250);
    expect(sleep).not.toHaveBeenCalledWith(10);
  });

  it('applies the 90-day window to repos and releases', async () => {
    const run = async (now: string) => {
      const scraper = new GithubScraper({
        token: 't',
        userAgent: 'ua',
        getJson: vi.fn(async (url: string) =>
          url === REPOS
            ? fixture('github-vercel-repos.json')
            : fixture('github-nextjs-releases.json'),
        ),
        sleep: async () => undefined,
        now: () => new Date(now),
      });
      return scraper.scrape(vercel);
    };
    const names = (items: Awaited<ReturnType<typeof run>>, kind: string) =>
      items.filter((i) => i.signal.payload['kind'] === kind);

    // cutoff 2026-10-22: the three newest repos qualify, the two from 10-16 do not
    const a = await run('2027-01-20T00:00:00Z');
    expect(names(a, 'new-repo').map((i) => i.signal.payload['name'])).toEqual([
      'marketplace-skills',
      'academy-starters',
      'academy-nextjs-foundations',
    ]);
    // cutoff 2026-11-05T00:00: no repo; releases .43 and .42 qualify (per repo), .41 does not
    const b = await run('2027-02-03T00:00:00Z');
    expect(names(b, 'new-repo')).toHaveLength(0);
    const tags = new Set(names(b, 'release').map((i) => i.signal.payload['tag']));
    expect(tags).toEqual(new Set(['v16.5.0-canary.43', 'v16.5.0-canary.42']));
    // exactly at the cutoff is still inside the window
    const c = await run('2027-02-04T23:41:56Z');
    const exact = new Set(names(c, 'release').map((i) => i.signal.payload['tag']));
    expect(exact).toEqual(new Set(['v16.5.0-canary.43']));
  });

  it('excludes items older than 90 days and drops releases with no publish date', async () => {
    const old = '2026-01-01T00:00:00Z';
    const repos = [
      {
        name: 'old',
        full_name: 'vercel/old',
        created_at: old,
        pushed_at: old,
        language: null,
        topics: [],
        stargazers_count: 1,
        html_url: 'https://github.com/vercel/old',
      },
    ];
    const releases = [
      { tag_name: 'v1', name: 'v1', published_at: old, prerelease: false, html_url: 'https://x/1' },
      {
        tag_name: 'v2',
        name: 'v2',
        published_at: null,
        prerelease: false,
        html_url: 'https://x/2',
      },
      {
        tag_name: 'v3',
        name: 'v3',
        published_at: '2026-11-01T00:00:00Z',
        prerelease: false,
        html_url: 'https://x/3',
      },
    ];
    const { scraper } = setup({
      [REPOS]: repos,
      'https://api.github.com/repos/vercel/old/releases?per_page=5': releases,
    });
    const items = await scraper.scrape(vercel);
    expect(items.map((i) => i.signal.externalId)).toEqual(['gh:vercel:release:vercel/old:v3']);
    expect(items[0]!.signal.payload).toMatchObject({
      kind: 'release',
      tag: 'v3',
      prerelease: false,
    });
  });

  it('is idempotent', async () => {
    const { scraper } = setup();
    expect(await scraper.scrape(vercel)).toEqual(await scraper.scrape(vercel));
  });

  it('keeps only allowed fields and no personal data', async () => {
    const polluted = (fixture('github-vercel-repos.json') as Array<Record<string, unknown>>).map(
      (r) => ({ ...r, owner: { login: 'someone' }, email: 'a@b.c', contributors_url: 'u' }),
    );
    const { scraper } = setup({ [REPOS]: polluted });
    const items = await scraper.scrape(vercel);
    const json = JSON.stringify(items);
    expect(json).not.toMatch(/someone|a@b\.c|login|owner|email|contributors|author/i);
    const kinds = new Set(items.map((i) => i.signal.payload['kind']));
    expect(kinds).toEqual(new Set(['new-repo', 'release']));
    for (const item of items) {
      const keys = Object.keys(item.signal.payload).sort();
      expect(keys).toEqual(
        item.signal.payload['kind'] === 'new-repo'
          ? [
              'createdAt',
              'fullName',
              'kind',
              'language',
              'name',
              'pushedAt',
              'stars',
              'topics',
              'url',
            ]
          : ['kind', 'name', 'prerelease', 'publishedAt', 'repo', 'tag', 'url'],
      );
    }
  });

  it('propagates rate-limit errors with retryAfterMs and stops further requests', async () => {
    const limited = new HttpError('HTTP 403', 403, 3_600_000, true);
    const { scraper, calls } = setup({
      'https://api.github.com/repos/vercel/academy-starters/releases?per_page=5': limited,
    });
    const err = await scraper.scrape(vercel).catch((e: unknown) => e);
    expect(err).toBe(limited);
    expect((err as HttpError).retryAfterMs).toBe(3_600_000);
    expect(calls).toHaveLength(2);
  });

  it('propagates a rate limit on the repos list and rejects bad input', async () => {
    const limited = new HttpError('HTTP 429', 429, 60_000, true);
    const { scraper } = setup({ [REPOS]: limited });
    await expect(scraper.scrape(vercel)).rejects.toBe(limited);
    await expect(scraper.scrape({ ...vercel, githubOrg: null })).rejects.toThrow('githubOrg');
    const bad = setup({ [REPOS]: { message: 'nope' } });
    await expect(bad.scraper.scrape(vercel)).rejects.toThrow('Unexpected GitHub response shape');
  });

  it('sends the token only as a Bearer header via the default fetcher', async () => {
    const fetchSpy = vi
      .spyOn(globalThis, 'fetch')
      .mockResolvedValue(new Response(JSON.stringify([]), { status: 200 }));
    try {
      const scraper = new GithubScraper({ token: 'tok123', userAgent: 'ua/1', now: () => NOW });
      await scraper.scrape(vercel);
      const init = fetchSpy.mock.calls[0]![1] as { headers: Record<string, string> };
      expect(init.headers).toMatchObject({
        Authorization: 'Bearer tok123',
        Accept: 'application/vnd.github+json',
        'User-Agent': 'ua/1',
      });
    } finally {
      fetchSpy.mockRestore();
    }
  });
});
