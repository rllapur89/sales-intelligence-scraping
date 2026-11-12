export interface Summary {
  count: number;
  min: number;
  max: number;
  mean: number;
  p50: number;
  p95: number;
  p99: number;
}

/**
 * Nearest-rank percentile of an ascending-sorted array (`p` in 0-100).
 * Nearest rank never invents values: the result is always one of the samples.
 */
export function percentile(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  const clamped = Math.min(100, Math.max(0, p));
  const rank = Math.max(1, Math.ceil((clamped / 100) * sorted.length));
  return sorted[rank - 1] as number;
}

export function summarize(samples: readonly number[]): Summary {
  if (samples.length === 0) {
    return { count: 0, min: 0, max: 0, mean: 0, p50: 0, p95: 0, p99: 0 };
  }
  const sorted = [...samples].sort((a, b) => a - b);
  const sum = sorted.reduce((acc, v) => acc + v, 0);
  return {
    count: sorted.length,
    min: sorted[0] as number,
    max: sorted[sorted.length - 1] as number,
    mean: sum / sorted.length,
    p50: percentile(sorted, 50),
    p95: percentile(sorted, 95),
    p99: percentile(sorted, 99),
  };
}
