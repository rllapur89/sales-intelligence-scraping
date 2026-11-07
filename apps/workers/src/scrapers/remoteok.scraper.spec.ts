import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyTarget } from '@leads/shared';
import { HttpError } from '../http/http-client';
import { deriveCompanyDomain, RemoteOkScraper } from './remoteok.scraper';

const feed = JSON.parse(
  readFileSync(join(__dirname, '../../test/fixtures/remoteok-feed.json'), 'utf8'),
) as Array<Record<string, unknown>>;

const target: CompanyTarget = { slug: 'feed', name: 'Remote OK', domain: 'remoteok.com' };

/** Fixture jobs (1..) with their apply_url replaced, to exercise domain derivation. */
function withApplyUrls(urls: Array<string | undefined>): unknown[] {
  return [
    feed[0],
    ...urls.map((applyUrl, i) => ({
      ...feed[i + 1],
      apply_url: applyUrl,
      url: feed[i + 1]!['url'],
    })),
  ];
}

describe('deriveCompanyDomain', () => {
  it('returns the lowercase host without www', () => {
    expect(deriveCompanyDomain('https://www.Acme.com/careers/42?x=1')).toBe('acme.com');
    expect(deriveCompanyDomain('https://boards.acme.io/job')).toBe('boards.acme.io');
  });

  it.each([
    'https://remoteOK.com/remote-jobs/x',
    'https://boards.greenhouse.io/acme/jobs/1',
    'https://jobs.lever.co/acme/1',
    'https://jobs.ashbyhq.com/acme',
    'https://acme.workable.com/j/1',
    'https://jobs.smartrecruiters.com/Acme/1',
    'https://acme.wd5.myworkdayjobs.com/en/x',
    'https://acme.bamboohr.com/careers/1',
    'https://acme.recruitee.com/o/x',
    'https://www.linkedin.com/jobs/view/1',
    'https://www.indeed.com/viewjob?jk=1',
    'https://jobs.acme.com/1',
    'mailto:jobs@acme.com',
    'not a url',
    'https://localhost/x',
  ])('rejects %s', (url) => {
    expect(deriveCompanyDomain(url)).toBeNull();
  });

  it('falls back to the next candidate and ignores empty values', () => {
    expect(deriveCompanyDomain(undefined, '', 'https://remoteok.com/x', 'https://acme.com/a')).toBe(
      'acme.com',
    );
    expect(deriveCompanyDomain(undefined, null, 42)).toBeNull();
  });
});

describe('RemoteOkScraper (recorded fixture, no network)', () => {
  it('requests the API once, skips element 0 and counts jobs without a company domain', async () => {
    const getJson = vi.fn().mockResolvedValue(feed);
    const scraper = new RemoteOkScraper(getJson);
    const items = await scraper.scrape(target);
    expect(getJson).toHaveBeenCalledTimes(1);
    expect(getJson).toHaveBeenCalledWith('https://remoteok.com/api');
    // every recorded job applies through remoteok.com, so none has a company host
    expect(items).toHaveLength(0);
    expect(scraper.lastSkippedNoDomain).toBe(feed.length - 1);
  });

  it('maps jobs with a company apply_url, with attribution and no description/logo', async () => {
    const body = withApplyUrls([
      'https://www.serverobotics.com/careers/1',
      undefined,
      'https://jobs.lever.co/toptal/1',
      'https://toptal.com/apply/9',
    ]);
    const scraper = new RemoteOkScraper(vi.fn().mockResolvedValue(body));
    const items = await scraper.scrape(target);
    expect(items.map((i) => i.company.domain)).toEqual(['serverobotics.com', 'toptal.com']);
    expect(scraper.lastSkippedNoDomain).toBe(2);

    const first = items[0]!;
    expect(first.company).toEqual({ name: feed[1]!['company'], domain: 'serverobotics.com' });
    expect(first.signal.type).toBe('hiring');
    expect(first.signal.externalId).toBe(`remoteok:${feed[1]!['id']}`);
    expect(first.signal.detectedAt).toBe(
      new Date((feed[1]!['epoch'] as number) * 1000).toISOString(),
    );
    expect(first.signal.payload).toMatchObject({
      title: 'Registered Nurse',
      salaryMin: 110,
      salaryMax: 130,
      location: null,
      url: `https://remoteok.com/remote-jobs/${feed[1]!['slug']}`,
      attribution: {
        name: 'Remote OK',
        url: `https://remoteok.com/remote-jobs/${feed[1]!['slug']}`,
      },
    });
    for (const item of items) {
      const payload = item.signal.payload;
      expect(Object.keys(payload).sort()).toEqual([
        'attribution',
        'location',
        'salaryMax',
        'salaryMin',
        'tags',
        'title',
        'url',
      ]);
      expect(payload['attribution']).toEqual({ name: 'Remote OK', url: payload['url'] });
      expect(new URL(payload['url'] as string).hostname).toBe('remoteok.com');
    }
  });

  it('turns zero salaries into null', async () => {
    const body = withApplyUrls([undefined, undefined, 'https://toptal.com/apply/9']);
    const [item] = await new RemoteOkScraper(vi.fn().mockResolvedValue(body)).scrape(target);
    expect(item!.signal.payload).toMatchObject({ salaryMin: null, salaryMax: null });
  });

  it('caps tags at 10', async () => {
    const tags = Array.from({ length: 14 }, (_, i) => `tag${i}`);
    const body = [feed[0], { ...feed[1], tags, apply_url: 'https://acme.com/apply' }];
    const [item] = await new RemoteOkScraper(vi.fn().mockResolvedValue(body)).scrape(target);
    expect(item!.signal.payload['tags']).toEqual(tags.slice(0, 10));
  });

  it('is idempotent and resets the skipped counter on each run', async () => {
    const body = withApplyUrls(['https://acme.com/a']);
    const scraper = new RemoteOkScraper(vi.fn().mockResolvedValue(body));
    const a = await scraper.scrape(target);
    const b = await scraper.scrape(target);
    expect(a).toEqual(b);
    expect(scraper.lastSkippedNoDomain).toBe(0);
  });

  it('never treats the legal notice as a job and skips malformed jobs', async () => {
    const body = [
      { id: '1', slug: 's', position: 'P', company: 'C', epoch: 1, apply_url: 'https://c.com' },
      'x',
      { id: '2' },
      { ...feed[1], epoch: 'nope', apply_url: 'https://c.com' },
    ];
    const scraper = new RemoteOkScraper(vi.fn().mockResolvedValue(body));
    expect(await scraper.scrape(target)).toEqual([]);
    expect(scraper.lastSkippedNoDomain).toBe(0);
  });

  it('rejects a non-array body and propagates rate-limit errors with retryAfterMs', async () => {
    await expect(new RemoteOkScraper(vi.fn().mockResolvedValue({})).scrape(target)).rejects.toThrow(
      'Unexpected Remote OK response shape',
    );
    const limited = new HttpError('HTTP 429', 429, 12_000, true);
    const err = await new RemoteOkScraper(vi.fn().mockRejectedValue(limited))
      .scrape(target)
      .catch((e: unknown) => e);
    expect(err).toBe(limited);
    expect((err as HttpError).retryAfterMs).toBe(12_000);
  });
});
