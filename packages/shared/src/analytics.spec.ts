import { describe, expect, it } from 'vitest';
import {
  buildBreakdown,
  buildFunnel,
  buildScoreTrend,
  buildSignalMix,
  percentOf,
  roundAvg,
  scoreTrendStart,
  utcDayKey,
} from './analytics';

describe('percentOf / roundAvg', () => {
  it('rounds to one decimal and guards a zero denominator', () => {
    expect(percentOf(1, 3)).toBe(33.3);
    expect(percentOf(2, 3)).toBe(66.7);
    expect(percentOf(5, 0)).toBe(0);
  });

  it('turns missing averages into 0', () => {
    expect(roundAvg(null)).toBe(0);
    expect(roundAvg(undefined)).toBe(0);
    expect(roundAvg(Number.NaN)).toBe(0);
    expect(roundAvg(71.26)).toBe(71.3);
  });
});

describe('buildFunnel', () => {
  it('is cumulative: a lead at a stage also counts for the earlier ones', () => {
    const funnel = buildFunnel({ new: 50, contacted: 20, qualified: 10, proposal: 5, won: 5 });
    expect(funnel.stages.map((s) => [s.stage, s.count])).toEqual([
      ['new', 90],
      ['contacted', 40],
      ['qualified', 20],
      ['proposal', 10],
      ['won', 5],
    ]);
  });

  it('computes conversion from the previous stage', () => {
    const funnel = buildFunnel({ new: 60, contacted: 20, qualified: 10, proposal: 5, won: 5 });
    expect(funnel.stages.map((s) => s.conversionFromPrevious)).toEqual([100, 40, 50, 50, 50]);
  });

  it('counts lost leads in the first stage only', () => {
    const funnel = buildFunnel({ new: 1, won: 1, lost: 8 });
    expect(funnel.stages.map((s) => s.count)).toEqual([10, 1, 1, 1, 1]);
  });

  it('returns five zeroed stages with no conversion when there are no leads', () => {
    const funnel = buildFunnel({});
    expect(funnel.stages).toHaveLength(5);
    expect(funnel.stages.every((s) => s.count === 0 && s.conversionFromPrevious === 0)).toBe(true);
  });

  it('does not divide by zero after an empty stage and ignores negative counts', () => {
    const funnel = buildFunnel({ new: 4, contacted: -3 });
    expect(funnel.stages.map((s) => s.count)).toEqual([4, 0, 0, 0, 0]);
    expect(funnel.stages[2].conversionFromPrevious).toBe(0);
  });
});

describe('buildBreakdown', () => {
  it('sorts by count desc then key and rounds the average', () => {
    const dto = buildBreakdown([
      { key: 'b', count: 2, avgScore: 70.04 },
      { key: 'a', count: 2, avgScore: 80 },
      { key: 'c', count: 9, avgScore: 55.55 },
    ]);
    expect(dto.items.map((i) => i.key)).toEqual(['c', 'a', 'b']);
    expect(dto.items[0]).toEqual({ key: 'c', label: 'c', count: 9, avgScore: 55.6 });
    expect(dto.items[2].avgScore).toBe(70);
  });

  it('maps null and blank keys to a merged "unknown" group with a weighted average', () => {
    const dto = buildBreakdown([
      { key: null, count: 1, avgScore: 100 },
      { key: '  ', count: 3, avgScore: 60 },
    ]);
    expect(dto.items).toEqual([{ key: 'unknown', label: 'Unknown', count: 4, avgScore: 70 }]);
  });

  it('uses the label function, drops empty groups and honours the limit', () => {
    const dto = buildBreakdown(
      [
        { key: 'x', count: 3, avgScore: 1 },
        { key: 'y', count: 2, avgScore: 1 },
        { key: 'z', count: 0, avgScore: null },
      ],
      (k) => k.toUpperCase(),
      1,
    );
    expect(dto.items).toEqual([{ key: 'x', label: 'X', count: 3, avgScore: 1 }]);
  });

  it('returns no items for no rows', () => {
    expect(buildBreakdown([])).toEqual({ items: [] });
  });
});

describe('buildSignalMix', () => {
  it('zero-fills every type and orders by count', () => {
    const mix = buildSignalMix({ funding: 7, hiring: 7, filing: 1 });
    expect(mix.items).toEqual([
      { type: 'hiring', count: 7 },
      { type: 'funding', count: 7 },
      { type: 'filing', count: 1 },
      { type: 'oss-activity', count: 0 },
      { type: 'website-tech', count: 0 },
    ]);
  });
});

describe('score trend', () => {
  const now = new Date('2025-03-10T15:30:00.000Z');

  it('formats UTC days and finds the window start', () => {
    expect(utcDayKey(new Date('2025-03-10T23:59:59.999Z'))).toBe('2025-03-10');
    expect(scoreTrendStart(1, now).toISOString()).toBe('2025-03-10T00:00:00.000Z');
    expect(scoreTrendStart(7, now).toISOString()).toBe('2025-03-04T00:00:00.000Z');
  });

  it('zero-fills missing days, oldest first, with exactly `days` points', () => {
    const trend = buildScoreTrend(
      3,
      [
        { date: '2025-03-08', newLeads: 2, avgScore: 61.25 },
        { date: '2025-03-10', newLeads: 1, avgScore: 90 },
      ],
      now,
    );
    expect(trend).toEqual({
      days: 3,
      points: [
        { date: '2025-03-08', newLeads: 2, avgScore: 61.3 },
        { date: '2025-03-09', newLeads: 0, avgScore: 0 },
        { date: '2025-03-10', newLeads: 1, avgScore: 90 },
      ],
    });
  });

  it('ignores rows outside the window and crosses month boundaries', () => {
    const trend = buildScoreTrend(
      3,
      [{ date: '2025-01-01', newLeads: 9, avgScore: 50 }],
      new Date('2025-03-01T00:00:00.000Z'),
    );
    expect(trend.points.map((p) => p.date)).toEqual(['2025-02-27', '2025-02-28', '2025-03-01']);
    expect(trend.points.every((p) => p.newLeads === 0)).toBe(true);
  });
});
