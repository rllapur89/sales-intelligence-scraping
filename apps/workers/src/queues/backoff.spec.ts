import { describe, expect, it } from 'vitest';
import { jitteredBackoffMs } from './backoff';

const policy = { baseMs: 1000, capMs: 10_000 };

describe('jitteredBackoffMs', () => {
  it('grows exponentially between half and full of the step', () => {
    expect(jitteredBackoffMs(1, policy, () => 0)).toBe(500);
    expect(jitteredBackoffMs(1, policy, () => 1)).toBe(1000);
    expect(jitteredBackoffMs(3, policy, () => 0)).toBe(2000);
    expect(jitteredBackoffMs(3, policy, () => 1)).toBe(4000);
  });

  it('never exceeds the cap', () => {
    expect(jitteredBackoffMs(20, policy, () => 1)).toBe(10_000);
  });

  it('is never instant, even with the lowest random draw', () => {
    expect(jitteredBackoffMs(1, policy, () => 0)).toBeGreaterThan(0);
  });

  it('uses Retry-After as a floor', () => {
    expect(jitteredBackoffMs(1, policy, () => 0, 60_000)).toBe(60_000);
    expect(jitteredBackoffMs(5, policy, () => 1, 100)).toBe(10_000);
  });

  it('produces different delays for different random draws (jitter)', () => {
    const a = jitteredBackoffMs(4, policy, () => 0.1);
    const b = jitteredBackoffMs(4, policy, () => 0.9);
    expect(a).not.toBe(b);
  });
});
