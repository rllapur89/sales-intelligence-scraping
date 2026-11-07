import type { SignalDto, SignalType } from '@leads/shared';

export interface SignalAttribution {
  name: string;
  url: string;
}

/** What the lead detail panel renders for one signal. */
export interface SignalView {
  id: string;
  type: SignalType;
  /** Human label: job title, repo, filing form, page title... never empty. */
  title: string;
  /** ISO date used for sorting and display. */
  date: string;
  /** Link to the original item (only http/https), when the payload has one. */
  url: string | null;
  /** "via {name}" credit when the payload carries `attribution` (RemoteOK requires it). */
  attribution: SignalAttribution | null;
}

export const MAX_RECENT_SIGNALS = 50;

function text(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}

/** Only absolute http(s) URLs become links, so a payload can never inject `javascript:`. */
export function safeHttpUrl(value: unknown): string | null {
  const raw = text(value);
  if (!raw) return null;
  try {
    const url = new URL(raw);
    return url.protocol === 'http:' || url.protocol === 'https:' ? url.toString() : null;
  } catch {
    return null;
  }
}

function attributionOf(payload: Record<string, unknown>): SignalAttribution | null {
  const raw = payload['attribution'];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return null;
  const record = raw as Record<string, unknown>;
  const name = text(record['name']);
  const url = safeHttpUrl(record['url']);
  return name && url ? { name, url } : null;
}

function titleOf(signal: SignalDto): string {
  const p = signal.payload;
  switch (signal.type) {
    case 'filing': {
      const form = text(p['form']);
      return form ? `SEC filing ${form}` : 'SEC filing';
    }
    case 'oss-activity': {
      if (p['kind'] === 'release') {
        const repo = text(p['repo']);
        const tag = text(p['tag']) ?? text(p['name']);
        return ['Release', tag, repo ? `(${repo})` : null].filter(Boolean).join(' ');
      }
      const repo = text(p['fullName']) ?? text(p['name']);
      return repo ? `New repo ${repo}` : 'New repository';
    }
    case 'website-tech':
      return text(p['title']) ?? 'Website technology detected';
    default:
      return text(p['title']) ?? text(p['name']) ?? signal.type;
  }
}

export function toSignalView(signal: SignalDto): SignalView {
  const attribution = attributionOf(signal.payload);
  return {
    id: signal.id,
    type: signal.type,
    title: titleOf(signal),
    date: signal.detectedAt,
    url: safeHttpUrl(signal.payload['url']) ?? attribution?.url ?? null,
    attribution,
  };
}

/** Newest first, capped; accepts any order from the API. */
export function recentSignalViews(
  signals: readonly SignalDto[],
  limit: number = MAX_RECENT_SIGNALS
): SignalView[] {
  return signals
    .map(toSignalView)
    .sort((a, b) => Date.parse(b.date) - Date.parse(a.date))
    .slice(0, Math.max(0, limit));
}
