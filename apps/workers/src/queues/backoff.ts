import type { SourcePolicy } from '@leads/shared';

/**
 * Exponential backoff with "equal jitter": half of the exponential step is fixed, half is random.
 * It spreads retries of many tasks (no thundering herd) without ever retrying instantly.
 * A server-provided Retry-After is a floor: we never retry earlier than it asks.
 */
export function jitteredBackoffMs(
  attemptsMade: number,
  backoff: SourcePolicy['backoff'],
  rng: () => number = Math.random,
  retryAfterMs?: number,
): number {
  const exp = Math.min(backoff.capMs, backoff.baseMs * 2 ** Math.max(0, attemptsMade - 1));
  const jittered = Math.round(exp / 2 + rng() * (exp / 2));
  return Math.max(jittered, retryAfterMs ?? 0);
}
