import { describe, expect, it } from 'vitest';
import { percentile, summarize } from './percentiles';

const hundred = Array.from({ length: 100 }, (_, i) => i + 1);

describe('percentile', () => {
  it('uses the nearest rank method', () => {
    expect(percentile(hundred, 50)).toBe(50);
    expect(percentile(hundred, 95)).toBe(95);
    expect(percentile(hundred, 99)).toBe(99);
    expect(percentile(hundred, 100)).toBe(100);
  });

  it('returns the only sample for any percentile', () => {
    expect(percentile([7], 1)).toBe(7);
    expect(percentile([7], 99)).toBe(7);
  });

  it('returns the first sample for p0 and clamps out-of-range values', () => {
    expect(percentile(hundred, 0)).toBe(1);
    expect(percentile(hundred, -5)).toBe(1);
    expect(percentile(hundred, 250)).toBe(100);
  });

  it('is 0 for an empty list', () => {
    expect(percentile([], 50)).toBe(0);
  });
});

describe('summarize', () => {
  it('sorts a copy and does not mutate the input', () => {
    const input = [5, 1, 3];
    const s = summarize(input);
    expect(input).toEqual([5, 1, 3]);
    expect(s).toMatchObject({ count: 3, min: 1, max: 5, mean: 3, p50: 3 });
  });

  it('is all zeros for no samples', () => {
    expect(summarize([])).toEqual({ count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 });
  });

  it('reports tail percentiles of a skewed distribution', () => {
    const samples = [...Array.from({ length: 98 }, () => 10), 500, 900];
    const s = summarize(samples);
    expect(s.p50).toBe(10);
    expect(s.p99).toBe(500);
    expect(s.max).toBe(900);
  });
});
