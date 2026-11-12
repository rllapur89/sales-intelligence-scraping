import type { SourceKey } from './sources';

/** A worker refreshes its heartbeat every interval; the key expires if it stops. */
export const WORKER_HEARTBEAT_INTERVAL_MS = 10_000;
export const WORKER_HEARTBEAT_TTL_SECONDS = 30;

/**
 * Redis key a worker keeps alive while it serves `source`. The API checks it before enqueueing, so a
 * job is never queued for a source nobody is working (for example `github` without `GITHUB_TOKEN`).
 */
export function workerPresenceKey(source: SourceKey): string {
  return `leads:workers:source:${source}`;
}
