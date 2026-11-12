import type { SubscriptionFilter } from '@leads/shared';
import type { CoalescedEntry } from './coalescer';
import { matchesAny } from './match-filter';

/** What the planner needs to know about the ids a session was already sent. */
export interface HeldLookup {
  has(id: string): boolean;
}

export interface DispatchPlan {
  /** Entries that match the filters: sent as a normal batch (held or not). */
  deliveries: CoalescedEntry[];
  /** The subset of `deliveries` the session did not hold before: they just started to match. */
  newMatches: CoalescedEntry[];
  /** Entries the session holds that no longer match: the client must drop them. */
  retractions: CoalescedEntry[];
}

/**
 * Splits one coalesced window into what a session must receive, given the lead ids it holds and
 * its filters. Pure: the caller applies the plan to the held set (add deliveries, remove
 * retractions).
 *
 * - matching lead -> delivery (and a new match when it was not held);
 * - not matching and held -> retraction;
 * - not matching and not held -> nothing (the client never saw it).
 */
export function planDispatch(
  held: HeldLookup,
  entries: Iterable<CoalescedEntry>,
  filters: readonly SubscriptionFilter[],
): DispatchPlan {
  const plan: DispatchPlan = { deliveries: [], newMatches: [], retractions: [] };
  for (const entry of entries) {
    if (matchesAny(entry.lead, filters)) {
      plan.deliveries.push(entry);
      if (!held.has(entry.lead.id)) plan.newMatches.push(entry);
    } else if (held.has(entry.lead.id)) {
      plan.retractions.push(entry);
    }
  }
  return plan;
}
