import { describe, expect, it } from 'vitest';
import type { SubscriptionFilter } from '@leads/shared';
import { makeLead } from './fixtures';
import { matchesAny, matchesFilter } from './match-filter';

const any: SubscriptionFilter = { industries: [], regions: [], signalTypes: [], minScore: 0 };

describe('matchesFilter', () => {
  const lead = makeLead('a', { score: 60, signalTypes: ['hiring', 'funding'] });

  it('empty arrays and minScore 0 match everything', () => {
    expect(matchesFilter(lead, any)).toBe(true);
    expect(matchesFilter(makeLead('n', { industry: null, region: null }), any)).toBe(true);
  });

  it('minScore is inclusive', () => {
    expect(matchesFilter(lead, { ...any, minScore: 60 })).toBe(true);
    expect(matchesFilter(lead, { ...any, minScore: 61 })).toBe(false);
  });

  it('industry and region must be listed; null never matches a non-empty list', () => {
    expect(matchesFilter(lead, { ...any, industries: ['SaaS', 'Fintech'] })).toBe(true);
    expect(matchesFilter(lead, { ...any, industries: ['Fintech'] })).toBe(false);
    expect(matchesFilter(lead, { ...any, regions: ['EU'] })).toBe(false);
    expect(matchesFilter(makeLead('n', { industry: null }), { ...any, industries: ['SaaS'] })).toBe(
      false,
    );
  });

  it('signal types need any overlap', () => {
    expect(matchesFilter(lead, { ...any, signalTypes: ['funding', 'filing'] })).toBe(true);
    expect(matchesFilter(lead, { ...any, signalTypes: ['filing'] })).toBe(false);
  });

  it('all criteria are ANDed', () => {
    expect(matchesFilter(lead, { ...any, industries: ['SaaS'], regions: ['EU'] })).toBe(false);
  });
});

describe('matchesAny', () => {
  const lead = makeLead('a', { score: 10 });

  it('no subscriptions means nothing', () => {
    expect(matchesAny(lead, [])).toBe(false);
  });

  it('matches when at least one subscription matches', () => {
    expect(matchesAny(lead, [{ ...any, minScore: 90 }, any])).toBe(true);
    expect(matchesAny(lead, [{ ...any, minScore: 90 }])).toBe(false);
  });
});
