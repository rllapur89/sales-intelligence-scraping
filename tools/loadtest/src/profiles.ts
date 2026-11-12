import { SIGNAL_TYPES, type SignalType, type SubscriptionFilter } from '@leads/shared';
import { pickMany } from './rng';

export const INDUSTRIES = [
  'SaaS',
  'Fintech',
  'Health',
  'E-commerce',
  'Infrastructure',
  'AI',
] as const;
export const REGIONS = ['US', 'EU', 'LATAM', 'APAC'] as const;

/**
 * Builds the filter of the i-th synthetic user. Profiles cycle through five shapes so the swarm
 * mixes broad subscribers (receive almost everything) with narrow ones (receive a small slice):
 *   0 firehose, 1 one industry, 2 one region + signal type, 3 high score, 4 narrow combo.
 */
export function buildProfile(index: number, rng: () => number): SubscriptionFilter {
  const shape = index % 5;
  const industries = (n: number): string[] => pickMany(rng, INDUSTRIES, n);
  const regions = (n: number): string[] => pickMany(rng, REGIONS, n);
  const signals = (n: number): SignalType[] => pickMany(rng, SIGNAL_TYPES, n);

  switch (shape) {
    case 0:
      return { industries: [], regions: [], signalTypes: [], minScore: 0 };
    case 1:
      return { industries: industries(1), regions: [], signalTypes: [], minScore: 0 };
    case 2:
      return { industries: [], regions: regions(1), signalTypes: signals(1), minScore: 0 };
    case 3:
      return { industries: [], regions: [], signalTypes: [], minScore: 70 };
    default:
      return {
        industries: industries(2),
        regions: regions(2),
        signalTypes: signals(2),
        minScore: 40,
      };
  }
}

export function buildProfiles(count: number, rng: () => number): SubscriptionFilter[] {
  return Array.from({ length: count }, (_, i) => buildProfile(i, rng));
}

/** Spreads `clients` over `users` as evenly as possible; the first users get the remainder. */
export function clientsPerUser(clients: number, users: number): number[] {
  const base = Math.floor(clients / users);
  const extra = clients % users;
  return Array.from({ length: users }, (_, i) => base + (i < extra ? 1 : 0));
}
