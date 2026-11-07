import type { EventTimings, LeadBatch, LeadDto, SubscriptionFilter } from '@leads/shared';
import { matchesAny } from './match-filter';

/** Autoincrement ids can become visible out of commit order, so replay re-reads this many. */
export const REPLAY_OVERLAP = 100;
export const REPLAY_CHUNK_SIZE = 500;

export type ResyncPlan =
  | { mode: 'full'; reason: 'gap-too-large' | 'unknown-seq' }
  | { mode: 'delta'; afterSeq: number };

export function planResync(lastSeq: number, currentSeq: number, maxGap: number): ResyncPlan {
  if (!Number.isFinite(lastSeq) || lastSeq <= 0 || lastSeq > currentSeq) {
    return { mode: 'full', reason: 'unknown-seq' };
  }
  if (currentSeq - lastSeq > maxGap) return { mode: 'full', reason: 'gap-too-large' };
  return { mode: 'delta', afterSeq: Math.max(0, lastSeq - REPLAY_OVERLAP) };
}

export interface ReplayRow {
  seq: number;
  lead: LeadDto;
  timings: EventTimings;
}

/**
 * Coalesces replay rows per lead (highest seq wins), filters by the user's subscriptions and
 * chunks into batches of at most `chunkSize` leads.
 */
export function buildReplayBatches(
  rows: readonly ReplayRow[],
  filters: readonly SubscriptionFilter[],
  publishedAt: number,
  chunkSize: number = REPLAY_CHUNK_SIZE,
): LeadBatch[] {
  const latest = new Map<string, ReplayRow>();
  for (const row of rows) {
    const held = latest.get(row.lead.id);
    if (!held || row.seq > held.seq) latest.set(row.lead.id, row);
  }
  const visible = [...latest.values()]
    .filter((row) => matchesAny(row.lead, filters))
    .sort((a, b) => a.seq - b.seq);
  const batches: LeadBatch[] = [];
  for (let i = 0; i < visible.length; i += chunkSize) {
    const chunk = visible.slice(i, i + chunkSize);
    const timings: Record<string, EventTimings> = {};
    for (const row of chunk) timings[row.lead.id] = { ...row.timings, publishedAt };
    batches.push({
      fromSeq: chunk[0]?.seq ?? 0,
      toSeq: chunk[chunk.length - 1]?.seq ?? 0,
      leads: chunk.map((row) => row.lead),
      timings,
    });
  }
  return batches;
}
