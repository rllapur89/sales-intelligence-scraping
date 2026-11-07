import { describe, expect, it } from 'vitest';
import { computeSuccessRate, roundAvgScore, startOfUtcDay, weekAgo } from './metrics-math';

describe('metrics math', () => {
  it('success rate is 100 when nothing finished', () => {
    expect(computeSuccessRate(0, 0)).toBe(100);
  });

  it('computes completed/(completed+failed) as a percentage', () => {
    expect(computeSuccessRate(3, 1)).toBe(75);
    expect(computeSuccessRate(0, 4)).toBe(0);
    expect(computeSuccessRate(5, 0)).toBe(100);
    expect(computeSuccessRate(1, 2)).toBe(33.3);
  });

  it('rounds avg score to 1 decimal, 0 for no leads', () => {
    expect(roundAvgScore(null)).toBe(0);
    expect(roundAvgScore(66.666)).toBe(66.7);
  });

  it('computes UTC day start and 7 day window', () => {
    const now = new Date('2025-03-10T15:30:00.000Z');
    expect(startOfUtcDay(now).toISOString()).toBe('2025-03-10T00:00:00.000Z');
    expect(weekAgo(now).toISOString()).toBe('2025-03-03T15:30:00.000Z');
  });
});
