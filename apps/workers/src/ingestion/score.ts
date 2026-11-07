import type { SignalType } from '@leads/shared';

export interface ScorableSignal {
  type: SignalType;
  detectedAt: Date;
  /** Sub-kind of the signal (`oss-activity`: `new-repo` | `release`). Unknown kinds count as releases. */
  kind?: string | null;
}

const DAY_MS = 86_400_000;

/** Fresh signals count fully, then decay; signals older than 90 days no longer count. */
export function recencyWeight(detectedAt: Date, now: Date): number {
  const ageDays = (now.getTime() - detectedAt.getTime()) / DAY_MS;
  if (ageDays <= 14) return 1;
  if (ageDays <= 30) return 0.5;
  if (ageDays <= 90) return 0.2;
  return 0;
}

function ageDays(detectedAt: Date, now: Date): number {
  return (now.getTime() - detectedAt.getTime()) / DAY_MS;
}

export const OSS_CAP = 15;
export const OSS_POINTS = { 'new-repo': 8, release: 5 } as const;
export const FILING_POINTS = { within30Days: 25, within90Days: 10 } as const;
export const FUNDING_CAP = 20;
export const WEBSITE_TECH_POINTS = 5;
export const DIVERSITY_POINTS = 10;

/**
 * Lead score v2, 0-100: the sum of one component per signal type, plus a diversity bonus.
 * Let w(s) be the recency weight (1 up to 14 days, 0.5 up to 30, 0.2 up to 90, else 0). A signal
 * older than 90 days is dead: it adds nothing and does not count as a live type.
 *
 *   hiring       = 15 * log2(1 + sum of w)       diminishing returns: 1 job ~15, 15 jobs ~60
 *   filing       = 25 for the freshest filing within 30 days, else 10 within 90 days (no stacking)
 *   oss-activity = min(15, sum of base * w)      base: new-repo 8, release 5 (other kinds: 5)
 *   funding      = min(20, 20 * max w)           one round is what matters, not how often it is seen
 *   website-tech = 5 once, while the signal is live (enrichment, not intent)
 *   diversity    = +10 for every live signal type beyond the first
 *
 * score = clamp(round(sum of the components + diversity), 0, 100); 0 without live signals.
 * Monotonic (adding a signal never lowers it), fresher beats staler, pure given `now`.
 */
export function scoreLead(signals: ScorableSignal[], now: Date = new Date()): number {
  let hiringWeight = 0;
  let filing = 0;
  let oss = 0;
  let funding = 0;
  let websiteTech = 0;
  const liveTypes = new Set<SignalType>();

  for (const s of signals) {
    const w = recencyWeight(s.detectedAt, now);
    if (w === 0) continue;
    switch (s.type) {
      case 'hiring':
        hiringWeight += w;
        break;
      case 'filing':
        filing = Math.max(
          filing,
          ageDays(s.detectedAt, now) <= 30
            ? FILING_POINTS.within30Days
            : FILING_POINTS.within90Days,
        );
        break;
      case 'oss-activity':
        oss += (s.kind === 'new-repo' ? OSS_POINTS['new-repo'] : OSS_POINTS.release) * w;
        break;
      case 'funding':
        funding = Math.max(funding, FUNDING_CAP * w);
        break;
      case 'website-tech':
        websiteTech = WEBSITE_TECH_POINTS;
        break;
    }
    liveTypes.add(s.type);
  }
  if (liveTypes.size === 0) return 0;

  const total =
    15 * Math.log2(1 + hiringWeight) +
    filing +
    Math.min(OSS_CAP, oss) +
    Math.min(FUNDING_CAP, funding) +
    websiteTech +
    DIVERSITY_POINTS * (liveTypes.size - 1);
  return Math.max(0, Math.min(100, Math.round(total)));
}
