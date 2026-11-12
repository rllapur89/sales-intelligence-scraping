import {
  SOURCE_LABELS,
  buildBreakdown,
  buildFunnel,
  buildScoreTrend,
  buildSignalMix,
  scoreTrendStart,
  utcDayKey,
  type BreakdownDto,
  type BreakdownRow,
  type FunnelDto,
  type PipelineStage,
  type ScoreTrendDto,
  type SignalMixDto,
  type SignalType,
  type SourceKey,
} from '@leads/shared';
import { Lead } from '../models/lead.model';

/**
 * Mock mode computes the same DTOs as the API from the mock leads, with the same shared pure
 * functions. Leads carry no source and no creation date, so two documented approximations apply:
 *  - the source is the one that normally produces each signal type;
 *  - "new leads" per day use `updatedAt`.
 */
export const SIGNAL_PRIMARY_SOURCE: Record<SignalType, SourceKey> = {
  hiring: 'greenhouse',
  filing: 'sec-edgar',
  'oss-activity': 'github',
  funding: 'hn-hiring',
  'website-tech': 'website',
};

function groupRows(entries: readonly { key: string | null; score: number }[]): BreakdownRow[] {
  const groups = new Map<string | null, { count: number; sum: number }>();
  for (const { key, score } of entries) {
    const group = groups.get(key) ?? { count: 0, sum: 0 };
    group.count += 1;
    group.sum += score;
    groups.set(key, group);
  }
  return [...groups.entries()].map(([key, { count, sum }]) => ({
    key,
    count,
    avgScore: sum / count,
  }));
}

export function funnelFromLeads(leads: readonly Lead[]): FunnelDto {
  const counts: Partial<Record<PipelineStage, number>> = {};
  for (const lead of leads) counts[lead.stage] = (counts[lead.stage] ?? 0) + 1;
  return buildFunnel(counts);
}

export function byIndustryFromLeads(leads: readonly Lead[]): BreakdownDto {
  return buildBreakdown(
    groupRows(leads.map((lead) => ({ key: lead.company.industry, score: lead.score }))),
  );
}

export function bySourceFromLeads(leads: readonly Lead[]): BreakdownDto {
  const entries: { key: string; score: number }[] = [];
  for (const lead of leads) {
    const sources = new Set(lead.signalTypes.map((type) => SIGNAL_PRIMARY_SOURCE[type]));
    for (const source of sources) entries.push({ key: source, score: lead.score });
  }
  return buildBreakdown(groupRows(entries), (key) => SOURCE_LABELS[key as SourceKey] ?? key);
}

export function signalMixFromLeads(leads: readonly Lead[]): SignalMixDto {
  const counts: Partial<Record<SignalType, number>> = {};
  for (const lead of leads) {
    for (const type of new Set(lead.signalTypes)) counts[type] = (counts[type] ?? 0) + 1;
  }
  return buildSignalMix(counts);
}

export function scoreTrendFromLeads(
  leads: readonly Lead[],
  days: number,
  now: Date = new Date(),
): ScoreTrendDto {
  const start = scoreTrendStart(days, now).getTime();
  const end = now.getTime();
  const perDay = new Map<string, { count: number; sum: number }>();
  for (const lead of leads) {
    const at = new Date(lead.updatedAt);
    if (Number.isNaN(at.getTime()) || at.getTime() < start || at.getTime() > end) continue;
    const key = utcDayKey(at);
    const bucket = perDay.get(key) ?? { count: 0, sum: 0 };
    bucket.count += 1;
    bucket.sum += lead.score;
    perDay.set(key, bucket);
  }
  return buildScoreTrend(
    days,
    [...perDay.entries()].map(([date, { count, sum }]) => ({
      date,
      newLeads: count,
      avgScore: sum / count,
    })),
    now,
  );
}
