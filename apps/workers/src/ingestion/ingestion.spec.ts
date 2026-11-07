import { describe, expect, it } from 'vitest';
import type { RawSignalItem } from '@leads/shared';
import {
  TECH_HINTS_MAX,
  cleanDescription,
  cleanTechHints,
  containsPersonalData,
  groupByCompany,
  mergeEnrichment,
  normalizeDomain,
  normalizeItem,
} from './normalize';
import { recencyWeight, scoreLead } from './score';

const now = new Date('2026-06-30T00:00:00Z');
const daysAgo = (d: number): Date => new Date(now.getTime() - d * 86_400_000);

const raw = (over: Partial<RawSignalItem['company']> = {}, id = 'gh:a:1'): RawSignalItem => ({
  company: { name: ' Acme   Inc ', domain: 'https://www.Acme.com/careers?x=1', ...over },
  signal: {
    type: 'hiring',
    externalId: id,
    detectedAt: '2026-06-01T00:00:00Z',
    payload: { title: 'Engineer' },
  },
});

describe('normalizeDomain', () => {
  it.each([
    ['https://www.Acme.com/careers?x=1', 'acme.com'],
    ['ACME.COM', 'acme.com'],
    ['http://user:pw@acme.com:8080/path', 'acme.com'],
    ['www.acme.co.uk.', 'acme.co.uk'],
  ])('normalizes %s', (input, expected) => expect(normalizeDomain(input)).toBe(expected));

  it.each(['', 'localhost', 'not a domain', 'acme', '-bad-.com'])('rejects %j', (input) =>
    expect(normalizeDomain(input)).toBeNull(),
  );
});

describe('normalizeItem', () => {
  it('normalizes company name and domain', () => {
    const r = normalizeItem(raw());
    expect(r.ok && r.item).toMatchObject({ domain: 'acme.com', name: 'Acme Inc' });
  });

  it('rejects invalid domains and bad dates', () => {
    expect(normalizeItem(raw({ domain: 'nope' }))).toEqual({ ok: false, reason: 'invalid-domain' });
    const bad = raw();
    bad.signal.detectedAt = 'yesterday';
    expect(normalizeItem(bad)).toEqual({ ok: false, reason: 'invalid-signal' });
  });

  it('rejects items carrying personal data', () => {
    const withEmail = raw();
    withEmail.signal.payload = { contact: 'jane.doe@acme.com' };
    expect(normalizeItem(withEmail)).toEqual({ ok: false, reason: 'personal-data' });
    const withKey = raw();
    withKey.signal.payload = { Phone: 'x' };
    expect(normalizeItem(withKey)).toEqual({ ok: false, reason: 'personal-data' });
  });
});

describe('containsPersonalData', () => {
  it('finds nested emails and person keys, ignores normal job data', () => {
    expect(containsPersonalData({ a: [{ b: 'x@y.io' }] })).toBe(true);
    expect(containsPersonalData({ first_name: 'A' })).toBe(true);
    expect(
      containsPersonalData({ title: 'Engineer', location: 'Remote', url: 'https://x.io/jobs/1' }),
    ).toBe(false);
  });
});

describe('groupByCompany (dedupe by domain)', () => {
  it('merges different spellings of the same domain and collapses repeated external ids', () => {
    const items = [
      raw({ domain: 'https://www.acme.com' }, 'gh:a:1'),
      raw({ domain: 'ACME.com' }, 'gh:a:2'),
      raw({ domain: 'acme.com/jobs' }, 'gh:a:1'),
      raw({ domain: 'other.io', name: 'Other' }, 'gh:o:1'),
    ].map((i) => {
      const n = normalizeItem(i);
      if (!n.ok) throw new Error('unexpected');
      return n.item;
    });
    const groups = groupByCompany(items);
    expect([...groups.keys()].sort()).toEqual(['acme.com', 'other.io']);
    expect(groups.get('acme.com')).toHaveLength(2);
  });
});

describe('scoreLead', () => {
  const hiring = (d: number) => ({ type: 'hiring' as const, detectedAt: daysAgo(d) });

  it('is 0 without live signals', () => {
    expect(scoreLead([], now)).toBe(0);
    expect(scoreLead([hiring(200)], now)).toBe(0);
  });

  it('grows with volume with diminishing returns, capped at 100', () => {
    const one = scoreLead([hiring(1)], now);
    const fifteen = scoreLead(
      Array.from({ length: 15 }, () => hiring(1)),
      now,
    );
    const huge = scoreLead(
      Array.from({ length: 5000 }, () => hiring(1)),
      now,
    );
    expect(one).toBe(15);
    expect(fifteen).toBe(60);
    expect(fifteen).toBeGreaterThan(one);
    expect(huge).toBe(100);
  });

  it('weights fresh signals above stale ones', () => {
    expect(scoreLead([hiring(1)], now)).toBeGreaterThan(scoreLead([hiring(20)], now));
    expect(scoreLead([hiring(20)], now)).toBeGreaterThan(scoreLead([hiring(60)], now));
    expect(recencyWeight(daysAgo(14), now)).toBe(1);
    expect(recencyWeight(daysAgo(91), now)).toBe(0);
  });

  it('adds a bonus for each extra live signal type', () => {
    const single = scoreLead([hiring(1)], now);
    const mixed = scoreLead([hiring(1), { type: 'filing', detectedAt: daysAgo(1) }], now);
    expect(mixed).toBeGreaterThan(single + 10);
  });
});

describe('enrichment normalization', () => {
  it('cleans the description to <= 300 chars and collapses whitespace', () => {
    const r = normalizeItem(raw({ description: `  A   great\n company ${'x'.repeat(400)}` }));
    expect(r.ok && r.item.description?.length).toBeLessThanOrEqual(300);
    expect(r.ok && r.item.description?.startsWith('A great company x')).toBe(true);
    expect(cleanDescription('   ')).toBeNull();
    expect(cleanDescription(null)).toBeNull();
  });

  it('trims, dedupes, sorts and caps tech hints at 30', () => {
    expect(cleanTechHints([' React ', 'Next.js', 'React', '', '  ', 'AWS'])).toEqual([
      'AWS',
      'Next.js',
      'React',
    ]);
    const many = Array.from({ length: 50 }, (_, i) => `tech-${String(i).padStart(2, '0')}`);
    const capped = cleanTechHints(many);
    expect(capped).toHaveLength(TECH_HINTS_MAX);
    expect(capped).toEqual([...capped].sort());
    expect(cleanTechHints(undefined)).toEqual([]);
    const r = normalizeItem(raw({ techHints: ['b', 'a', 'b'] }));
    expect(r.ok && r.item.techHints).toEqual(['a', 'b']);
  });

  it('defaults to no enrichment when the scraper sent none', () => {
    const r = normalizeItem(raw());
    expect(r.ok && r.item).toMatchObject({ description: null, techHints: [] });
  });
});

describe('mergeEnrichment', () => {
  it('fills a missing description but never replaces a known one', () => {
    expect(
      mergeEnrichment({ description: null, techHints: [] }, { description: 'new', techHints: [] }),
    ).toMatchObject({ description: 'new' });
    expect(
      mergeEnrichment({ description: 'old', techHints: [] }, { description: 'new', techHints: [] }),
    ).toMatchObject({ description: 'old' });
  });

  it('never erases: empty incoming data keeps known description and hints', () => {
    expect(
      mergeEnrichment(
        { description: 'old', techHints: ['React'] },
        { description: null, techHints: [] },
      ),
    ).toEqual({ description: 'old', techHints: ['React'] });
  });

  it('unions hints, sorted and deduped, and is idempotent', () => {
    const once = mergeEnrichment(
      { description: null, techHints: ['React', 'AWS'] },
      { description: null, techHints: ['Vue', 'React'] },
    );
    expect(once.techHints).toEqual(['AWS', 'React', 'Vue']);
    expect(mergeEnrichment(once, { description: null, techHints: ['Vue'] })).toEqual(once);
  });

  it('keeps every known hint when the cap is reached and ignores extra new ones', () => {
    const known = Array.from({ length: 30 }, (_, i) => `k-${String(i).padStart(2, '0')}`);
    const merged = mergeEnrichment(
      { description: null, techHints: known },
      { description: null, techHints: ['a-first', 'z-last'] },
    );
    expect(merged.techHints).toEqual(known);
    const partial = mergeEnrichment(
      { description: null, techHints: known.slice(0, 29) },
      { description: null, techHints: ['a', 'b'] },
    );
    expect(partial.techHints).toHaveLength(30);
    expect(partial.techHints).toContain('a');
    expect(partial.techHints).not.toContain('b');
  });
});
