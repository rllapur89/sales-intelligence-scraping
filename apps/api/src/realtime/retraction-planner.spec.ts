import { describe, expect, it } from 'vitest';
import type { SubscriptionFilter } from '@leads/shared';
import type { CoalescedEntry } from './coalescer';
import { makeLead } from './fixtures';
import { planDispatch } from './retraction-planner';

const any: SubscriptionFilter = { industries: [], regions: [], signalTypes: [], minScore: 0 };
const min = (minScore: number): SubscriptionFilter => ({ ...any, minScore });

const entry = (id: string, over: Parameters<typeof makeLead>[1] = {}): CoalescedEntry => ({
  lead: makeLead(id, over),
  timings: { scrapedAt: 1, ingestedAt: 2 },
});
const ids = (entries: CoalescedEntry[]) => entries.map((e) => e.lead.id);
const held = (...heldIds: string[]) => new Set(heldIds);

describe('planDispatch', () => {
  it('delivers a matching lead that was not held as a new match', () => {
    const plan = planDispatch(held(), [entry('a', { score: 80 })], [min(50)]);
    expect(ids(plan.deliveries)).toEqual(['a']);
    expect(ids(plan.newMatches)).toEqual(['a']);
    expect(plan.retractions).toEqual([]);
  });

  it('delivers an update of a held lead that still matches without flagging it as new', () => {
    const plan = planDispatch(held('a'), [entry('a', { score: 90 })], [min(50)]);
    expect(ids(plan.deliveries)).toEqual(['a']);
    expect(plan.newMatches).toEqual([]);
    expect(plan.retractions).toEqual([]);
  });

  it('retracts a held lead whose score dropped below the minimum', () => {
    const plan = planDispatch(held('a'), [entry('a', { score: 10 })], [min(50)]);
    expect(plan.deliveries).toEqual([]);
    expect(ids(plan.retractions)).toEqual(['a']);
  });

  it('retracts a held lead whose industry no longer matches', () => {
    const filter: SubscriptionFilter = { ...any, industries: ['SaaS'] };
    const plan = planDispatch(held('a'), [entry('a', { industry: 'Retail' })], [filter]);
    expect(ids(plan.retractions)).toEqual(['a']);
  });

  it('retracts a held lead whose region became unknown (null)', () => {
    const filter: SubscriptionFilter = { ...any, regions: ['US'] };
    const plan = planDispatch(held('a'), [entry('a', { region: null })], [filter]);
    expect(ids(plan.retractions)).toEqual(['a']);
  });

  it('retracts a held lead whose signal types no longer overlap', () => {
    const filter: SubscriptionFilter = { ...any, signalTypes: ['funding'] };
    const plan = planDispatch(held('a'), [entry('a', { signalTypes: ['hiring'] })], [filter]);
    expect(ids(plan.retractions)).toEqual(['a']);
  });

  it('ignores a non-matching lead the session never held', () => {
    const plan = planDispatch(held(), [entry('a', { score: 10 })], [min(50)]);
    expect(plan).toEqual({ deliveries: [], newMatches: [], retractions: [] });
  });

  it('retracts every held lead when the user has no active subscription', () => {
    const plan = planDispatch(held('a', 'b'), [entry('a'), entry('b'), entry('c')], []);
    expect(plan.deliveries).toEqual([]);
    expect(ids(plan.retractions)).toEqual(['a', 'b']);
  });

  it('keeps a lead when any one of several subscriptions still matches', () => {
    const plan = planDispatch(held('a'), [entry('a', { score: 60 })], [min(90), min(50)]);
    expect(ids(plan.deliveries)).toEqual(['a']);
    expect(plan.retractions).toEqual([]);
  });

  it('handles a mixed window and preserves entry order', () => {
    const entries = [
      entry('keep', { score: 70 }),
      entry('drop', { score: 5 }),
      entry('fresh', { score: 95 }),
      entry('unseen', { score: 5 }),
    ];
    const plan = planDispatch(held('keep', 'drop'), entries, [min(50)]);
    expect(ids(plan.deliveries)).toEqual(['keep', 'fresh']);
    expect(ids(plan.newMatches)).toEqual(['fresh']);
    expect(ids(plan.retractions)).toEqual(['drop']);
  });

  it('does not mutate the held lookup and returns the same entry objects', () => {
    const lookup = held('a');
    const e = entry('a', { score: 1 });
    const plan = planDispatch(lookup, [e], [min(50)]);
    expect([...lookup]).toEqual(['a']);
    expect(plan.retractions[0]).toBe(e);
  });

  it('returns an empty plan for an empty window', () => {
    expect(planDispatch(held('a'), [], [any])).toEqual({
      deliveries: [],
      newMatches: [],
      retractions: [],
    });
  });
});
