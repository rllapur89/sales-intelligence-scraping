import { describe, expect, it } from 'vitest';
import type { NotificationType, SubscriptionFilter } from '@leads/shared';
import { makeLead } from '../realtime/fixtures';
import type { CoalescedEntry } from '../realtime/coalescer';
import {
  dedupeCutoff,
  decideNewMatches,
  decideRetractions,
  qualifiesForNewMatch,
  shouldNotifyNewMatch,
  toCandidate,
  buildWindowNotifications,
} from './notification-rules';

const any: SubscriptionFilter = { industries: [], regions: [], signalTypes: [], minScore: 0 };
const now = new Date('2026-02-02T12:00:00.000Z');
const hoursAgo = (h: number) => new Date(now.getTime() - h * 3_600_000);
const c = (leadId: string) => ({ leadId, title: `Company ${leadId}` });

describe('qualifiesForNewMatch', () => {
  it('needs a score of at least 70', () => {
    expect(qualifiesForNewMatch(makeLead('a', { score: 70 }), [any])).toBe(true);
    expect(qualifiesForNewMatch(makeLead('a', { score: 69 }), [any])).toBe(false);
    expect(qualifiesForNewMatch(makeLead('a', { score: 100 }), [any])).toBe(true);
  });

  it('needs a matching notify subscription', () => {
    const saas: SubscriptionFilter = { ...any, industries: ['SaaS'] };
    expect(qualifiesForNewMatch(makeLead('a', { score: 90, industry: 'Retail' }), [saas])).toBe(
      false,
    );
    expect(qualifiesForNewMatch(makeLead('a', { score: 90, industry: 'SaaS' }), [saas])).toBe(true);
  });

  it('never qualifies without notify subscriptions', () => {
    expect(qualifiesForNewMatch(makeLead('a', { score: 99 }), [])).toBe(false);
  });

  it('is also bound by the subscription minimum score', () => {
    const strict: SubscriptionFilter = { ...any, minScore: 90 };
    expect(qualifiesForNewMatch(makeLead('a', { score: 80 }), [strict])).toBe(false);
  });
});

describe('toCandidate', () => {
  it('carries only the lead id and the company name', () => {
    expect(toCandidate(makeLead('a'))).toEqual({ leadId: 'a', title: 'Company a' });
  });
});

describe('dedupe window', () => {
  it('cutoff is exactly 24 hours before now', () => {
    expect(dedupeCutoff(now).toISOString()).toBe('2026-02-01T12:00:00.000Z');
  });

  it('notifies when never notified, or when the last one is 24 h old or older', () => {
    expect(shouldNotifyNewMatch(null, now)).toBe(true);
    expect(shouldNotifyNewMatch(hoursAgo(24), now)).toBe(true);
    expect(shouldNotifyNewMatch(hoursAgo(48), now)).toBe(true);
  });

  it('does not notify again inside the window', () => {
    expect(shouldNotifyNewMatch(hoursAgo(23.99), now)).toBe(false);
    expect(shouldNotifyNewMatch(now, now)).toBe(false);
  });
});

describe('decideNewMatches', () => {
  it('keeps candidates without a recent notification', () => {
    const last = new Map([
      ['b', hoursAgo(1)],
      ['c', hoursAgo(30)],
    ]);
    expect(decideNewMatches([c('a'), c('b'), c('c')], last, now).map((x) => x.leadId)).toEqual([
      'a',
      'c',
    ]);
  });

  it('yields one candidate for a lead listed twice', () => {
    expect(decideNewMatches([c('a'), c('a')], new Map(), now)).toEqual([c('a')]);
  });

  it('returns nothing for no candidates', () => {
    expect(decideNewMatches([], new Map(), now)).toEqual([]);
  });
});

describe('decideRetractions', () => {
  const latest = new Map<string, NotificationType>([
    ['notified', 'new_match'],
    ['already', 'retracted'],
  ]);

  it('retracts only leads whose latest notification is a new_match', () => {
    const out = decideRetractions([c('notified'), c('already'), c('never')], latest);
    expect(out.map((x) => x.leadId)).toEqual(['notified']);
  });

  it('does not repeat the retraction for a duplicate candidate', () => {
    expect(decideRetractions([c('notified'), c('notified')], latest)).toHaveLength(1);
  });

  it('returns nothing when the user was never notified', () => {
    expect(decideRetractions([c('a')], new Map())).toEqual([]);
  });
});

describe('buildWindowNotifications', () => {
  const entry = (id: string, score: number): CoalescedEntry => ({
    lead: makeLead(id, { score }),
    timings: { scrapedAt: 1, ingestedAt: 2 },
  });

  it('keeps qualifying new matches and every retraction as candidates', () => {
    const out = buildWindowNotifications(
      { newMatches: [entry('hot', 90), entry('cold', 40)], retractions: [entry('gone', 5)] },
      [any],
    );
    expect(out).toEqual({ matches: [c('hot')], retractions: [c('gone')] });
  });

  it('has no matches without notify subscriptions but still lists retractions', () => {
    const out = buildWindowNotifications(
      { newMatches: [entry('hot', 90)], retractions: [entry('gone', 5)] },
      [],
    );
    expect(out.matches).toEqual([]);
    expect(out.retractions).toEqual([c('gone')]);
  });
});
