import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { encodeCursor } from '../common/cursor';
import {
  buildLeadListWhere,
  buildLeadOrderBy,
  buildLeadWhere,
  leadCursorFor,
  sliceKeysetPage,
} from './lead-query';

describe('buildLeadWhere', () => {
  it('is empty without filters (and ignores empty arrays)', () => {
    expect(buildLeadWhere({})).toEqual({});
    expect(buildLeadWhere({ industry: [], region: [], signalType: [] })).toEqual({});
  });

  it('maps every filter', () => {
    expect(
      buildLeadWhere({
        industry: ['SaaS'],
        region: ['EU'],
        signalType: ['oss-activity', 'hiring'],
        minScore: 40,
        stage: 'proposal',
        q: '  acme ',
      }),
    ).toEqual({
      industry: { in: ['SaaS'] },
      region: { in: ['EU'] },
      signalTypes: { hasSome: ['OSS_ACTIVITY', 'HIRING'] },
      score: { gte: 40 },
      stage: 'PROPOSAL',
      company: { name: { contains: 'acme', mode: 'insensitive' } },
    });
  });

  it('keeps minScore 0 and ignores blank q', () => {
    expect(buildLeadWhere({ minScore: 0, q: '   ' })).toEqual({ score: { gte: 0 } });
  });
});

describe('ordering and keyset', () => {
  it('orders by score then id, or updatedAt then id', () => {
    expect(buildLeadOrderBy('score')).toEqual([{ score: 'desc' }, { id: 'desc' }]);
    expect(buildLeadOrderBy('updated')).toEqual([{ updatedAt: 'desc' }, { id: 'desc' }]);
  });

  it('adds a score keyset condition next to the filters', () => {
    const cursor = encodeCursor('score', { value: 50, id: 'k' });
    expect(buildLeadListWhere({ minScore: 10 }, 'score', cursor)).toEqual({
      AND: [
        { score: { gte: 10 } },
        { OR: [{ score: { lt: 50 } }, { score: 50, id: { lt: 'k' } }] },
      ],
    });
  });

  it('adds an updatedAt keyset condition', () => {
    const iso = '2025-01-02T03:04:05.000Z';
    const cursor = encodeCursor('updated', { value: iso, id: 'k' });
    const at = new Date(iso);
    expect(buildLeadListWhere({}, 'updated', cursor)).toEqual({
      AND: [{}, { OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: 'k' } }] }],
    });
  });

  it('rejects a cursor of the other sort with 400', () => {
    const cursor = encodeCursor('score', { value: 5, id: 'k' });
    expect(() => buildLeadListWhere({}, 'updated', cursor)).toThrow(BadRequestException);
    expect(() => buildLeadListWhere({}, 'score', 'garbage')).toThrow(BadRequestException);
  });

  it('builds cursors from rows', () => {
    const row = { id: 'a', score: 9, updatedAt: new Date('2025-01-02T03:04:05.000Z') };
    expect(leadCursorFor('score', row)).toBe(encodeCursor('score', { value: 9, id: 'a' }));
    expect(leadCursorFor('updated', row)).toBe(
      encodeCursor('updated', { value: '2025-01-02T03:04:05.000Z', id: 'a' }),
    );
  });
});

describe('sliceKeysetPage', () => {
  const cursorOf = (n: number): string => `c${n}`;

  it('returns no cursor on the last page', () => {
    expect(sliceKeysetPage([1, 2], 2, cursorOf)).toEqual({ items: [1, 2], nextCursor: null });
    expect(sliceKeysetPage([], 5, cursorOf)).toEqual({ items: [], nextCursor: null });
  });

  it('drops the probe row and cursors on the last returned item', () => {
    expect(sliceKeysetPage([1, 2, 3], 2, cursorOf)).toEqual({ items: [1, 2], nextCursor: 'c2' });
  });
});
