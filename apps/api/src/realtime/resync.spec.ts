import { describe, expect, it } from 'vitest';
import type { SubscriptionFilter } from '@leads/shared';
import { makeLead } from './fixtures';
import { buildReplayBatches, planResync, type ReplayRow } from './resync';

const any: SubscriptionFilter = { industries: [], regions: [], signalTypes: [], minScore: 0 };
const row = (seq: number, id: string, score = 50): ReplayRow => ({
  seq,
  lead: makeLead(id, { seq, score }),
  timings: { scrapedAt: 1, ingestedAt: 2 },
});

describe('planResync', () => {
  it('unknown seq: <= 0 or ahead of the server', () => {
    expect(planResync(0, 100, 5000)).toEqual({ mode: 'full', reason: 'unknown-seq' });
    expect(planResync(-3, 100, 5000)).toEqual({ mode: 'full', reason: 'unknown-seq' });
    expect(planResync(101, 100, 5000)).toEqual({ mode: 'full', reason: 'unknown-seq' });
    expect(planResync(Number.NaN, 100, 5000)).toEqual({ mode: 'full', reason: 'unknown-seq' });
  });

  it('gap larger than max gap needs a full resync; equal gap is replayed', () => {
    expect(planResync(1, 5002, 5000)).toEqual({ mode: 'full', reason: 'gap-too-large' });
    expect(planResync(2, 5002, 5000)).toEqual({ mode: 'delta', afterSeq: 0 });
  });

  it('delta replays from lastSeq - 100 (overlap), never below 0', () => {
    expect(planResync(500, 600, 5000)).toEqual({ mode: 'delta', afterSeq: 400 });
    expect(planResync(50, 60, 5000)).toEqual({ mode: 'delta', afterSeq: 0 });
    expect(planResync(600, 600, 5000)).toEqual({ mode: 'delta', afterSeq: 500 });
  });
});

describe('buildReplayBatches', () => {
  it('coalesces per lead keeping the latest payload', () => {
    const batches = buildReplayBatches([row(3, 'a', 10), row(7, 'a', 90), row(5, 'b')], [any], 42);
    expect(batches).toHaveLength(1);
    expect(batches[0]?.leads.map((l) => [l.id, l.score])).toEqual([
      ['b', 50],
      ['a', 90],
    ]);
    expect(batches[0]?.fromSeq).toBe(5);
    expect(batches[0]?.toSeq).toBe(7);
    expect(batches[0]?.timings['a']?.publishedAt).toBe(42);
  });

  it('filters by subscriptions; no subscriptions yields no batches', () => {
    const rows = [row(1, 'a', 10), row(2, 'b', 80)];
    expect(buildReplayBatches(rows, [{ ...any, minScore: 50 }], 0)[0]?.leads).toHaveLength(1);
    expect(buildReplayBatches(rows, [], 0)).toEqual([]);
  });

  it('chunks into batches of at most chunkSize leads', () => {
    const rows = Array.from({ length: 1201 }, (_, i) => row(i + 1, `l${i}`));
    const batches = buildReplayBatches(rows, [any], 0, 500);
    expect(batches.map((b) => b.leads.length)).toEqual([500, 500, 201]);
    expect(Object.keys(batches[2]?.timings ?? {})).toHaveLength(201);
  });
});
