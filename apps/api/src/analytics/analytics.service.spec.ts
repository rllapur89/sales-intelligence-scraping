import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { AnalyticsService } from './analytics.service';

describe('AnalyticsService', () => {
  const lead = { groupBy: vi.fn(), aggregate: vi.fn() };
  const signal = { groupBy: vi.fn() };
  const queryRaw = vi.fn();
  let service: AnalyticsService;

  beforeEach(() => {
    for (const fn of [lead.groupBy, lead.aggregate, signal.groupBy, queryRaw]) fn.mockReset();
    service = new AnalyticsService({
      lead,
      signal,
      $queryRaw: queryRaw,
    } as unknown as PrismaService);
  });

  it('funnel groups leads by stage and builds the cumulative funnel', async () => {
    lead.groupBy.mockResolvedValue([
      { stage: 'NEW', _count: { _all: 6 } },
      { stage: 'CONTACTED', _count: { _all: 3 } },
      { stage: 'WON', _count: { _all: 1 } },
      { stage: 'LOST', _count: { _all: 2 } },
    ]);
    const funnel = await service.funnel();
    expect(lead.groupBy).toHaveBeenCalledWith({ by: ['stage'], _count: { _all: true } });
    expect(funnel.stages.map((s) => s.count)).toEqual([12, 4, 1, 1, 1]);
    expect(funnel.stages[1].conversionFromPrevious).toBe(33.3);
  });

  it('byIndustry groups by industry, names null "unknown" and sorts by count', async () => {
    lead.groupBy.mockResolvedValue([
      { industry: null, _count: { _all: 2 }, _avg: { score: 50 } },
      { industry: 'Finance', _count: { _all: 5 }, _avg: { score: 80.25 } },
    ]);
    const out = await service.byIndustry();
    expect(lead.groupBy.mock.calls[0]?.[0]).toMatchObject({ by: ['industry'] });
    expect(out.items).toEqual([
      { key: 'Finance', label: 'Finance', count: 5, avgScore: 80.3 },
      { key: 'unknown', label: 'Unknown', count: 2, avgScore: 50 },
    ]);
  });

  it('bySource aggregates leads per source with DB enum keys and drops sources without leads', async () => {
    lead.aggregate.mockImplementation(
      async (args: { where: { company: { signals: { some: { source: { key: string } } } } } }) => {
        const key = args.where.company.signals.some.source.key;
        if (key === 'HN_HIRING') return { _count: { _all: 4 }, _avg: { score: 70 } };
        if (key === 'GITHUB') return { _count: { _all: 9 }, _avg: { score: 61.04 } };
        return { _count: { _all: 0 }, _avg: { score: null } };
      },
    );
    const out = await service.bySource();
    expect(lead.aggregate).toHaveBeenCalledTimes(7);
    expect(out.items).toEqual([
      { key: 'github', label: 'GitHub', count: 9, avgScore: 61 },
      { key: 'hn-hiring', label: 'HN Hiring', count: 4, avgScore: 70 },
    ]);
  });

  it('signals groups signals by type and zero-fills the rest', async () => {
    signal.groupBy.mockResolvedValue([
      { type: 'FUNDING', _count: { _all: 8 } },
      { type: 'HIRING', _count: { _all: 20 } },
    ]);
    const out = await service.signals();
    expect(out.items).toHaveLength(5);
    expect(out.items.slice(0, 2)).toEqual([
      { type: 'hiring', count: 20 },
      { type: 'funding', count: 8 },
    ]);
    expect(out.items.at(-1)?.count).toBe(0);
  });

  it('scoreTrend runs one parameterized query with the window start and zero-fills', async () => {
    const now = new Date('2025-03-10T15:30:00.000Z');
    queryRaw.mockResolvedValue([{ day: '2025-03-09', count: 3n, avg: 64.5 }]);
    const out = await service.scoreTrend(3, now);
    expect(queryRaw).toHaveBeenCalledTimes(1);
    const sql = queryRaw.mock.calls[0]?.[0] as { values: unknown[]; sql: string };
    expect(sql.values).toEqual([new Date('2025-03-08T00:00:00.000Z')]);
    expect(sql.sql).toContain('"createdAt" >= ?');
    expect(out).toEqual({
      days: 3,
      points: [
        { date: '2025-03-08', newLeads: 0, avgScore: 0 },
        { date: '2025-03-09', newLeads: 3, avgScore: 64.5 },
        { date: '2025-03-10', newLeads: 0, avgScore: 0 },
      ],
    });
  });

  it('scoreTrend returns an all-zero window for an empty table', async () => {
    queryRaw.mockResolvedValue([]);
    const out = await service.scoreTrend(7, new Date('2025-03-10T00:00:00.000Z'));
    expect(out.points).toHaveLength(7);
    expect(out.points.every((p) => p.newLeads === 0 && p.avgScore === 0)).toBe(true);
  });
});
