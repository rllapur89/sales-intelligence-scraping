import type { Lead } from '../models/lead.model';

export const SNAPSHOT_VERSION = 1;
/** Default maximum age of a cached snapshot: 7 days. */
export const DEFAULT_SNAPSHOT_MAX_AGE_MS = 7 * 24 * 60 * 60 * 1000;
/** Tolerated clock skew for a `savedAt` that lies in the future. */
const FUTURE_SKEW_MS = 60_000;

/** The single JSON-serializable snapshot kept for offline start. */
export interface Snapshot {
  version: 1;
  /** Epoch milliseconds when the snapshot was written. */
  savedAt: number;
  /** Highest event sequence number applied when the snapshot was written. */
  lastSeq: number;
  leads: Lead[];
}

function isFiniteNumber(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value);
}

function isLeadShape(value: unknown): value is Lead {
  if (typeof value !== 'object' || value === null) return false;
  const lead = value as Record<string, unknown>;
  return (
    typeof lead['id'] === 'string' &&
    lead['id'].length > 0 &&
    isFiniteNumber(lead['score']) &&
    isFiniteNumber(lead['seq']) &&
    typeof lead['company'] === 'object' &&
    lead['company'] !== null
  );
}

/**
 * True when `snapshot` has the expected version and shape, is not from the future and is not older
 * than `maxAgeMs`. Never throws, whatever the input is (corrupt storage content included). Pure.
 */
export function isSnapshotUsable(
  snapshot: unknown,
  now: number,
  maxAgeMs: number = DEFAULT_SNAPSHOT_MAX_AGE_MS
): snapshot is Snapshot {
  if (typeof snapshot !== 'object' || snapshot === null) return false;
  const s = snapshot as Record<string, unknown>;
  if (s['version'] !== SNAPSHOT_VERSION) return false;
  if (!isFiniteNumber(s['savedAt']) || !isFiniteNumber(s['lastSeq']) || s['lastSeq'] < 0) return false;
  if (!Array.isArray(s['leads'])) return false;
  const age = now - s['savedAt'];
  if (age < -FUTURE_SKEW_MS || age > maxAgeMs) return false;
  return s['leads'].every(isLeadShape);
}

/**
 * Keeps the `max` highest-score leads (ties: newest `seq` first). Returns a new array and never
 * mutates the input. A non-positive or non-finite `max` yields an empty list. Pure.
 */
export function capLeads(leads: readonly Lead[], max: number): Lead[] {
  if (!(max > 0)) return [];
  if (leads.length <= max) return [...leads];
  return [...leads].sort((a, b) => b.score - a.score || b.seq - a.seq).slice(0, Math.floor(max));
}
