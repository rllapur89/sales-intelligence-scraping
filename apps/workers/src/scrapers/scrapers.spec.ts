import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { CompanyTarget } from '@leads/shared';
import { HttpError } from '../http/http-client';
import { parseCompaniesConfig } from './companies-config';
import { GreenhouseScraper } from './greenhouse.scraper';
import { LeverScraper } from './lever.scraper';

const fixture = (name: string): unknown =>
  JSON.parse(readFileSync(join(__dirname, '../../test/fixtures', name), 'utf8'));

const figma: CompanyTarget = {
  slug: 'figma',
  name: 'Figma',
  domain: 'figma.com',
  industry: 'Design software',
  region: 'US',
};
const palantir: CompanyTarget = {
  slug: 'palantir',
  name: 'Palantir',
  domain: 'palantir.com',
  industry: 'Data & AI',
  region: 'US',
};

describe('GreenhouseScraper (recorded fixture, no network)', () => {
  it('maps each job to one hiring signal with a stable external id', async () => {
    const getJson = vi.fn().mockResolvedValue(fixture('greenhouse-figma.json'));
    const items = await new GreenhouseScraper(getJson).scrape(figma);
    expect(getJson).toHaveBeenCalledWith('https://boards-api.greenhouse.io/v1/boards/figma/jobs');
    expect(items).toHaveLength(3);
    const first = items[0]!;
    expect(first.signal.type).toBe('hiring');
    expect(first.signal.externalId).toBe('gh:figma:5426468004');
    expect(first.signal.detectedAt).toBe('2025-01-28T23:57:29.000Z');
    expect(first.signal.payload).toMatchObject({ title: 'Account Executive, Enterprise' });
    expect(first.company).toMatchObject({ domain: 'figma.com', name: 'Figma' });
  });

  it('is idempotent: scraping the same response twice yields identical items', async () => {
    const getJson = vi.fn().mockResolvedValue(fixture('greenhouse-figma.json'));
    const scraper = new GreenhouseScraper(getJson);
    expect(await scraper.scrape(figma)).toEqual(await scraper.scrape(figma));
  });

  it('stores no description or applicant fields', async () => {
    const getJson = vi.fn().mockResolvedValue(fixture('greenhouse-figma.json'));
    const [item] = await new GreenhouseScraper(getJson).scrape(figma);
    expect(Object.keys(item!.signal.payload).sort()).toEqual([
      'location',
      'title',
      'updatedAt',
      'url',
    ]);
  });

  it('skips malformed jobs and handles an empty board', async () => {
    const malformed = { jobs: [{ id: 1 }, 'x', { id: 2, title: 'T', updated_at: 'nope' }] };
    expect(await new GreenhouseScraper(vi.fn().mockResolvedValue(malformed)).scrape(figma)).toEqual(
      [],
    );
    expect(
      await new GreenhouseScraper(vi.fn().mockResolvedValue({ jobs: [] })).scrape(figma),
    ).toEqual([]);
  });

  it('fails on an unexpected response shape', async () => {
    const scraper = new GreenhouseScraper(vi.fn().mockResolvedValue({ nope: true }));
    await expect(scraper.scrape(figma)).rejects.toBeInstanceOf(HttpError);
  });

  it('propagates HTTP errors from the client', async () => {
    const scraper = new GreenhouseScraper(
      vi.fn().mockRejectedValue(new HttpError('429', 429, 5000)),
    );
    await expect(scraper.scrape(figma)).rejects.toMatchObject({ status: 429, retryAfterMs: 5000 });
  });
});

describe('LeverScraper (recorded fixture, no network)', () => {
  it('maps each posting to one hiring signal', async () => {
    const getJson = vi.fn().mockResolvedValue(fixture('lever-palantir.json'));
    const items = await new LeverScraper(getJson).scrape(palantir);
    expect(getJson).toHaveBeenCalledWith('https://api.lever.co/v0/postings/palantir?mode=json');
    expect(items).toHaveLength(2);
    const first = items[0]!;
    expect(first.signal.externalId).toBe('lever:palantir:6ed76ce8-4156-4b60-b120-403538bd66cd');
    expect(first.signal.detectedAt).toBe(new Date(1786469891368).toISOString());
    expect(first.signal.payload).toMatchObject({
      title: 'Administrative Business Partner',
      team: 'Administrative',
      location: 'Singapore, Singapore',
    });
  });

  it('handles an empty site and rejects a non-array body', async () => {
    expect(await new LeverScraper(vi.fn().mockResolvedValue([])).scrape(palantir)).toEqual([]);
    await expect(
      new LeverScraper(vi.fn().mockResolvedValue({ ok: false })).scrape(palantir),
    ).rejects.toBeInstanceOf(HttpError);
  });

  it('skips postings without id, title or a numeric createdAt', async () => {
    const bad = [{ id: 'a', text: 'T' }, { text: 'T', createdAt: 1 }, 7];
    expect(await new LeverScraper(vi.fn().mockResolvedValue(bad)).scrape(palantir)).toEqual([]);
  });
});

describe('parseCompaniesConfig', () => {
  it('accepts the shipped companies.json', () => {
    const raw: unknown = JSON.parse(
      readFileSync(join(__dirname, '../../config/companies.json'), 'utf8'),
    );
    const config = parseCompaniesConfig(raw);
    expect(config.greenhouse.length).toBeGreaterThanOrEqual(30);
    expect(config.lever.length).toBeGreaterThanOrEqual(25);
  });

  it('rejects entries without a domain and duplicate slugs', () => {
    expect(() => parseCompaniesConfig({ greenhouse: [{ slug: 'a', name: 'A' }] })).toThrow(
      'slug, name and domain',
    );
    const dup = { slug: 'a', name: 'A', domain: 'a.com' };
    expect(() => parseCompaniesConfig({ lever: [dup, dup] })).toThrow('duplicate slug');
  });
});
