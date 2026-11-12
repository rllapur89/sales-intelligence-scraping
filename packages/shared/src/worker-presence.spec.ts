import { describe, expect, it } from 'vitest';
import { SOURCE_KEYS } from './sources';
import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_TTL_SECONDS,
  workerPresenceKey,
} from './worker-presence';

describe('worker presence', () => {
  it('gives every source its own key', () => {
    const keys = SOURCE_KEYS.map(workerPresenceKey);
    expect(new Set(keys).size).toBe(SOURCE_KEYS.length);
    expect(workerPresenceKey('github')).toBe('leads:workers:source:github');
  });

  it('refreshes several times before the key expires', () => {
    expect(
      (WORKER_HEARTBEAT_TTL_SECONDS * 1000) / WORKER_HEARTBEAT_INTERVAL_MS,
    ).toBeGreaterThanOrEqual(2);
  });
});
