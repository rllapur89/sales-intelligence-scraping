import type { PipelineStage, SignalType } from './domain';
import { SIGNAL_TYPES } from './domain';
import type { SourceKey } from './sources';

/**
 * Analytics DTOs and the pure aggregation functions behind them. The API feeds them with Prisma
 * `groupBy`/aggregate rows; the desktop mock mode feeds them with the loaded leads, so both modes
 * produce exactly the same shapes.
 */

export const ANALYTICS_DEFAULT_DAYS = 30;
export const ANALYTICS_MAX_DAYS = 90;
/** Breakdowns keep the biggest groups only so charts stay readable. */
export const BREAKDOWN_MAX_ITEMS = 12;
export const UNKNOWN_KEY = 'unknown';

/** Stages of the sales path, in order. `lost` is off the path and is not a funnel stage. */
export const FUNNEL_STAGES = ['new', 'contacted', 'qualified', 'proposal', 'won'] as const;
export type FunnelStage = (typeof FUNNEL_STAGES)[number];

export interface FunnelStageDto {
  stage: FunnelStage;
  /** Leads that reached this stage or a later one of the path (lost leads only count in `new`). */
  count: number;
  /** Percentage (0-100, one decimal) of the previous stage; 100 for the first stage if it has leads. */
  conversionFromPrevious: number;
}

export interface FunnelDto {
  stages: FunnelStageDto[];
}

export interface BreakdownItemDto {
  key: string;
  label: string;
  count: number;
  /** Average lead score, one decimal; 0 when the group has no leads. */
  avgScore: number;
}

export interface BreakdownDto {
  items: BreakdownItemDto[];
}

export interface SignalMixItemDto {
  type: SignalType;
  count: number;
}

export interface SignalMixDto {
  items: SignalMixItemDto[];
}

export interface ScoreTrendPointDto {
  /** UTC day, `YYYY-MM-DD`. */
  date: string;
  newLeads: number;
  avgScore: number;
}

export interface ScoreTrendDto {
  days: number;
  /** Exactly `days` points, oldest first, zero-filled for days without leads. */
  points: ScoreTrendPointDto[];
}

export const SOURCE_LABELS: Record<SourceKey, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  'hn-hiring': 'HN Hiring',
  remoteok: 'RemoteOK',
  github: 'GitHub',
  'sec-edgar': 'SEC EDGAR',
  website: 'Website',
};

const DAY_MS = 24 * 60 * 60 * 1000;

export function round1(value: number): number {
  return Math.round(value * 10) / 10;
}

/** `part / whole` as a percentage with one decimal; 0 when `whole` is 0. */
export function percentOf(part: number, whole: number): number {
  return whole > 0 ? round1((part / whole) * 100) : 0;
}

/** Average rounded to one decimal; null/undefined/NaN (no rows) become 0. */
export function roundAvg(avg: number | null | undefined): number {
  return avg === null || avg === undefined || Number.isNaN(avg) ? 0 : round1(avg);
}

/**
 * Cumulative funnel from per-stage lead counts (`stageCounts` = leads currently AT each stage).
 * A lead at `qualified` has passed `new` and `contacted`, so `reached(stage)` sums that stage and
 * every later path stage. Lost leads entered the funnel but their last stage is unknown: they are
 * added to `new` only.
 */
export function buildFunnel(stageCounts: Partial<Record<PipelineStage, number>>): FunnelDto {
  const at = (stage: PipelineStage): number => Math.max(0, stageCounts[stage] ?? 0);
  const reached: number[] = FUNNEL_STAGES.map((_, index) =>
    FUNNEL_STAGES.slice(index).reduce((sum, stage) => sum + at(stage), 0),
  );
  reached[0] += at('lost');
  return {
    stages: FUNNEL_STAGES.map((stage, index) => ({
      stage,
      count: reached[index],
      conversionFromPrevious:
        index === 0 ? (reached[0] > 0 ? 100 : 0) : percentOf(reached[index], reached[index - 1]),
    })),
  };
}

export interface BreakdownRow {
  key: string | null;
  count: number;
  avgScore: number | null;
}

/**
 * Groups sorted by count (desc) then key, capped at `limit`. A null/blank key becomes `unknown`.
 * Rows that share a key (e.g. null and '') are merged with a count-weighted average.
 */
export function buildBreakdown(
  rows: readonly BreakdownRow[],
  labelOf: (key: string) => string = (key) => (key === UNKNOWN_KEY ? 'Unknown' : key),
  limit: number = BREAKDOWN_MAX_ITEMS,
): BreakdownDto {
  const merged = new Map<string, { count: number; scoreSum: number }>();
  for (const row of rows) {
    if (row.count <= 0) continue;
    const trimmed = row.key?.trim();
    const key = trimmed ? trimmed : UNKNOWN_KEY;
    const entry = merged.get(key) ?? { count: 0, scoreSum: 0 };
    entry.count += row.count;
    entry.scoreSum += (row.avgScore ?? 0) * row.count;
    merged.set(key, entry);
  }
  const items = [...merged.entries()]
    .map(([key, { count, scoreSum }]) => ({
      key,
      label: labelOf(key),
      count,
      avgScore: roundAvg(scoreSum / count),
    }))
    .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
    .slice(0, Math.max(0, limit));
  return { items };
}

/** Every signal type, zero-filled, biggest first (ties keep the canonical order). */
export function buildSignalMix(counts: Partial<Record<SignalType, number>>): SignalMixDto {
  const items = SIGNAL_TYPES.map((type) => ({ type, count: Math.max(0, counts[type] ?? 0) }));
  return { items: items.sort((a, b) => b.count - a.count) };
}

/** `YYYY-MM-DD` of the UTC day of `date`. */
export function utcDayKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** Start (00:00 UTC) of the oldest day of a `days`-day window that ends today. */
export function scoreTrendStart(days: number, now: Date = new Date()): Date {
  const today = Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate());
  return new Date(today - (days - 1) * DAY_MS);
}

export interface ScoreTrendRow {
  date: string;
  newLeads: number;
  avgScore: number | null;
}

/** One point per day of the window, zero-filled; rows outside the window are ignored. */
export function buildScoreTrend(
  days: number,
  rows: readonly ScoreTrendRow[],
  now: Date = new Date(),
): ScoreTrendDto {
  const byDate = new Map<string, ScoreTrendRow>();
  for (const row of rows) byDate.set(row.date, row);
  const start = scoreTrendStart(days, now).getTime();
  const points: ScoreTrendPointDto[] = [];
  for (let i = 0; i < days; i++) {
    const date = utcDayKey(new Date(start + i * DAY_MS));
    const row = byDate.get(date);
    points.push({
      date,
      newLeads: row ? Math.max(0, row.newLeads) : 0,
      avgScore: row ? roundAvg(row.avgScore) : 0,
    });
  }
  return { days, points };
}
