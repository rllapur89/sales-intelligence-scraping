import type { Dictionary } from '@ngrx/entity';
import { Lead } from '../../models/lead.model';

/**
 * Returns the leads of `incoming` that are strictly newer (higher `seq`) than the version held in
 * `held`. When a batch repeats a lead id, only its highest-seq version is considered. Pure.
 */
export function pickFreshLeads(held: Dictionary<Lead>, incoming: readonly Lead[]): Lead[] {
  const latest = new Map<string, Lead>();
  for (const lead of incoming) {
    const seen = latest.get(lead.id);
    if (!seen || lead.seq > seen.seq) latest.set(lead.id, lead);
  }
  const fresh: Lead[] = [];
  for (const lead of latest.values()) {
    const current = held[lead.id];
    if (!current || lead.seq > current.seq) fresh.push(lead);
  }
  return fresh;
}

/**
 * Combines a REST snapshot with what the store already holds: a held lead survives when it is newer
 * than the snapshot's version (or, when the snapshot lacks it, newer than the whole snapshot).
 * Batches that arrive while the snapshot is loading are therefore not lost. Pure.
 */
export function mergeSnapshot(held: Dictionary<Lead>, snapshot: readonly Lead[]): Lead[] {
  const merged = new Map<string, Lead>();
  let snapshotMax = 0;
  for (const lead of snapshot) {
    merged.set(lead.id, lead);
    if (lead.seq > snapshotMax) snapshotMax = lead.seq;
  }
  for (const id of Object.keys(held)) {
    const current = held[id];
    if (!current) continue;
    const fromSnapshot = merged.get(id);
    if (fromSnapshot ? current.seq > fromSnapshot.seq : current.seq > snapshotMax) {
      merged.set(id, current);
    }
  }
  return [...merged.values()];
}

/** Highest `seq` of a list of leads (0 when empty). Loop instead of spread: safe for 100k items. */
export function maxSeq(leads: readonly Lead[]): number {
  let max = 0;
  for (const lead of leads) if (lead.seq > max) max = lead.seq;
  return max;
}

/** Cap of ids kept in `changedIds` (flash highlight); older ids are dropped first. */
export const MAX_CHANGED_IDS = 2000;

export function appendChangedIds(current: readonly string[], added: readonly string[]): string[] {
  if (!added.length) return current as string[];
  const merged = [...new Set([...current, ...added])];
  return merged.length > MAX_CHANGED_IDS ? merged.slice(merged.length - MAX_CHANGED_IDS) : merged;
}
