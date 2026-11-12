import {
  fromDbSignalType as sharedFromDbSignalType,
  fromDbStage as sharedFromDbStage,
  type BreakdownRow,
  type PipelineStage,
  type ScoreTrendRow,
  type SignalType,
} from '@leads/shared';

/**
 * Adapters from raw Prisma aggregate rows to the inputs of the shared aggregation functions.
 * They are pure so they can be tested without a database.
 */

export interface StageGroupRow {
  stage: string;
  _count: { _all: number };
}

export interface SignalGroupRow {
  type: string;
  _count: { _all: number };
}

export interface IndustryGroupRow {
  industry: string | null;
  _count: { _all: number };
  _avg: { score: number | null };
}

/** Row of the date-bucketing query. Postgres returns counts as bigint and averages as numeric. */
export interface TrendRawRow {
  day: string;
  count: bigint | number;
  avg: number | string | null;
}

export function stageCountsFromGroups(
  rows: readonly StageGroupRow[],
): Partial<Record<PipelineStage, number>> {
  const out: Partial<Record<PipelineStage, number>> = {};
  for (const row of rows) {
    const stage = sharedFromDbStage(row.stage);
    out[stage] = (out[stage] ?? 0) + row._count._all;
  }
  return out;
}

export function signalCountsFromGroups(
  rows: readonly SignalGroupRow[],
): Partial<Record<SignalType, number>> {
  const out: Partial<Record<SignalType, number>> = {};
  for (const row of rows) {
    const type = sharedFromDbSignalType(row.type);
    out[type] = (out[type] ?? 0) + row._count._all;
  }
  return out;
}

export function industryRowsFromGroups(rows: readonly IndustryGroupRow[]): BreakdownRow[] {
  return rows.map((row) => ({
    key: row.industry,
    count: row._count._all,
    avgScore: row._avg.score,
  }));
}

export function trendRowsFromRaw(rows: readonly TrendRawRow[]): ScoreTrendRow[] {
  return rows.map((row) => {
    const avg = row.avg === null ? null : Number(row.avg);
    return {
      date: row.day,
      newLeads: Number(row.count),
      avgScore: avg === null || Number.isNaN(avg) ? null : avg,
    };
  });
}
