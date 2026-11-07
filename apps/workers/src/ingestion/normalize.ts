import type { RawSignalItem, SignalType } from '@leads/shared';
import { SIGNAL_TYPES } from '@leads/shared';

export interface NormalizedItem {
  domain: string;
  name: string;
  industry: string | null;
  region: string | null;
  /** Enrichment: at most DESCRIPTION_MAX_CHARS chars, whitespace collapsed. */
  description: string | null;
  /** Enrichment: trimmed, deduped, sorted, at most TECH_HINTS_MAX entries. */
  techHints: string[];
  signal: {
    type: SignalType;
    externalId: string;
    detectedAt: Date;
    payload: Record<string, unknown>;
  };
}

export const DESCRIPTION_MAX_CHARS = 300;
export const TECH_HINTS_MAX = 30;
const TECH_HINT_MAX_CHARS = 50;

const DOMAIN_RE = /^(?=.{4,253}$)([a-z0-9]([a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/;
const EMAIL_RE = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i;
const PHONE_KEYS = ['phone', 'telephone', 'mobile'];
const PERSON_KEYS = [
  'email',
  'firstname',
  'lastname',
  'fullname',
  'linkedin',
  'linkedinurl',
  ...PHONE_KEYS,
];

/**
 * Lowercases and strips scheme, credentials, port, path, a leading `www.` and a trailing dot.
 * It does not compute the public-suffix registrable domain (no PSL dependency); the curated
 * source configs are expected to already hold the company's main domain.
 */
export function normalizeDomain(raw: string): string | null {
  let value = raw.trim().toLowerCase();
  value = value.replace(/^[a-z][a-z0-9+.-]*:\/\//, '');
  value = value.replace(/^[^@/]*@/, '');
  value = value.split(/[/?#]/)[0] ?? '';
  value = value
    .replace(/:\d+$/, '')
    .replace(/\.$/, '')
    .replace(/^www\./, '');
  return DOMAIN_RE.test(value) ? value : null;
}

export function normalizeName(raw: string): string {
  return raw.replace(/\s+/g, ' ').trim().slice(0, 200);
}

function cleanLabel(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, ' ').trim();
  return v ? v.slice(0, 100) : null;
}

export function cleanDescription(value: string | null | undefined): string | null {
  const v = value?.replace(/\s+/g, ' ').trim().slice(0, DESCRIPTION_MAX_CHARS).trimEnd();
  return v ? v : null;
}

/** Trims, drops empty/oversized/duplicate hints, sorts, and keeps at most TECH_HINTS_MAX. */
export function cleanTechHints(values: readonly unknown[] | null | undefined): string[] {
  const set = new Set<string>();
  for (const v of values ?? []) {
    if (typeof v !== 'string') continue;
    const hint = v.replace(/\s+/g, ' ').trim();
    if (hint && hint.length <= TECH_HINT_MAX_CHARS) set.add(hint);
  }
  return [...set].sort().slice(0, TECH_HINTS_MAX);
}

/**
 * Enrichment merge. Description fills a gap only (a known description is never replaced).
 * Tech hints are a union that keeps every known hint (never erases) and adds new ones, sorted,
 * until TECH_HINTS_MAX. Pure and idempotent: merging the same input twice changes nothing.
 */
export function mergeEnrichment(
  known: { description: string | null; techHints: readonly string[] },
  incoming: { description: string | null; techHints: readonly string[] },
): { description: string | null; techHints: string[] } {
  const merged = new Set(cleanTechHints(known.techHints));
  for (const hint of cleanTechHints(incoming.techHints)) {
    if (merged.size >= TECH_HINTS_MAX) break;
    merged.add(hint);
  }
  return {
    description: known.description?.trim() ? known.description : incoming.description,
    techHints: [...merged].sort(),
  };
}

/** True when a payload key or string value looks like personal data. We drop such items entirely. */
export function containsPersonalData(value: unknown): boolean {
  if (typeof value === 'string') return EMAIL_RE.test(value);
  if (Array.isArray(value)) return value.some(containsPersonalData);
  if (typeof value === 'object' && value !== null) {
    return Object.entries(value).some(
      ([key, v]) =>
        PERSON_KEYS.includes(key.toLowerCase().replace(/[_-]/g, '')) || containsPersonalData(v),
    );
  }
  return false;
}

export type RejectReason = 'invalid-domain' | 'invalid-name' | 'invalid-signal' | 'personal-data';

export function normalizeItem(
  item: RawSignalItem,
): { ok: true; item: NormalizedItem } | { ok: false; reason: RejectReason } {
  const domain = normalizeDomain(item.company.domain);
  if (!domain) return { ok: false, reason: 'invalid-domain' };
  const name = normalizeName(item.company.name);
  if (!name) return { ok: false, reason: 'invalid-name' };
  const detectedAt = new Date(item.signal.detectedAt);
  if (
    !SIGNAL_TYPES.includes(item.signal.type) ||
    !item.signal.externalId ||
    Number.isNaN(detectedAt.getTime())
  ) {
    return { ok: false, reason: 'invalid-signal' };
  }
  if (containsPersonalData(item.signal.payload)) return { ok: false, reason: 'personal-data' };
  return {
    ok: true,
    item: {
      domain,
      name,
      industry: cleanLabel(item.company.industry),
      region: cleanLabel(item.company.region),
      description: cleanDescription(item.company.description),
      techHints: cleanTechHints(item.company.techHints),
      signal: {
        type: item.signal.type,
        externalId: item.signal.externalId,
        detectedAt,
        payload: item.signal.payload,
      },
    },
  };
}

/** Groups by normalized domain (company identity) and collapses duplicate external ids. */
export function groupByCompany(items: NormalizedItem[]): Map<string, NormalizedItem[]> {
  const groups = new Map<string, Map<string, NormalizedItem>>();
  for (const item of items) {
    const byId = groups.get(item.domain) ?? new Map<string, NormalizedItem>();
    byId.set(item.signal.externalId, item);
    groups.set(item.domain, byId);
  }
  return new Map([...groups].map(([domain, byId]) => [domain, [...byId.values()]]));
}
