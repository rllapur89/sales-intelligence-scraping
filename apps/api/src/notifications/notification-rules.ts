import {
  NOTIFY_DEDUPE_WINDOW_MS,
  NOTIFY_MIN_SCORE,
  type LeadDto,
  type NotificationType,
  type SubscriptionFilter,
} from '@leads/shared';
import { matchesAny } from '../realtime/match-filter';
import type { DispatchPlan } from '../realtime/retraction-planner';

/** Pure notification rules: who qualifies, what is a duplicate, what a retraction may notify. */

/** What a notification is about; `title` is the company name only. */
export interface NotificationCandidate {
  leadId: string;
  title: string;
}

/** A lead that newly matched qualifies when it scores high enough and a notify subscription matches. */
export function qualifiesForNewMatch(
  lead: LeadDto,
  notifyFilters: readonly SubscriptionFilter[],
): boolean {
  return lead.score >= NOTIFY_MIN_SCORE && matchesAny(lead, notifyFilters);
}

export function toCandidate(lead: LeadDto): NotificationCandidate {
  return { leadId: lead.id, title: lead.company.name };
}

/** Oldest `createdAt` that still counts as "already notified" at `now`. */
export function dedupeCutoff(now: Date): Date {
  return new Date(now.getTime() - NOTIFY_DEDUPE_WINDOW_MS);
}

/** One `new_match` per user and lead per 24 h: no earlier notification, or one older than that. */
export function shouldNotifyNewMatch(lastNotifiedAt: Date | null, now: Date): boolean {
  return lastNotifiedAt === null || lastNotifiedAt.getTime() <= dedupeCutoff(now).getTime();
}

/**
 * Candidates that must get a `new_match` row. `lastNotified` maps lead id to the most recent
 * `new_match` of this user. A lead listed twice yields one candidate.
 */
export function decideNewMatches(
  candidates: readonly NotificationCandidate[],
  lastNotified: ReadonlyMap<string, Date>,
  now: Date,
): NotificationCandidate[] {
  const seen = new Set<string>();
  const out: NotificationCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.leadId)) continue;
    seen.add(candidate.leadId);
    if (shouldNotifyNewMatch(lastNotified.get(candidate.leadId) ?? null, now)) out.push(candidate);
  }
  return out;
}

/**
 * Candidates that must get a `retracted` row: only leads the user was notified about, and only
 * while that notification is the latest one (a second retraction in a row is noise).
 * `latestType` maps lead id to the type of the user's most recent notification for it.
 */
export function decideRetractions(
  candidates: readonly NotificationCandidate[],
  latestType: ReadonlyMap<string, NotificationType>,
): NotificationCandidate[] {
  const seen = new Set<string>();
  const out: NotificationCandidate[] = [];
  for (const candidate of candidates) {
    if (seen.has(candidate.leadId)) continue;
    seen.add(candidate.leadId);
    if (latestType.get(candidate.leadId) === 'new_match') out.push(candidate);
  }
  return out;
}

/** The notification-relevant part of one session's dispatch plan. */
export function buildWindowNotifications(
  plan: Pick<DispatchPlan, 'newMatches' | 'retractions'>,
  notifyFilters: readonly SubscriptionFilter[],
): { matches: NotificationCandidate[]; retractions: NotificationCandidate[] } {
  return {
    matches: plan.newMatches
      .filter((entry) => qualifiesForNewMatch(entry.lead, notifyFilters))
      .map((entry) => toCandidate(entry.lead)),
    retractions: plan.retractions.map((entry) => toCandidate(entry.lead)),
  };
}
