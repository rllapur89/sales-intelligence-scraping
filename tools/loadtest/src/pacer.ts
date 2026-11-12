/**
 * How many events are due to hit `ratePerSecond` on average. Computed from elapsed time rather than
 * from the tick count, so a late timer catches up instead of silently lowering the rate.
 * `maxBurst` bounds the catch-up after a long stall (for example a GC pause).
 */
export function dueEvents(
  ratePerSecond: number,
  elapsedMs: number,
  alreadySent: number,
  maxBurst: number = Number.POSITIVE_INFINITY,
): number {
  if (ratePerSecond <= 0 || elapsedMs <= 0) return 0;
  const target = Math.floor((ratePerSecond * elapsedMs) / 1000);
  return Math.min(maxBurst, Math.max(0, target - alreadySent));
}
