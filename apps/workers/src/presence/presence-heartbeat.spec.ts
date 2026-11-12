import { afterEach, describe, expect, it, vi } from 'vitest';
import { WORKER_HEARTBEAT_TTL_SECONDS } from '@leads/shared';
import { PresenceHeartbeat } from './presence-heartbeat';

afterEach(() => vi.useRealTimers());

describe('PresenceHeartbeat', () => {
  it('writes one key per registered source with the TTL', async () => {
    const write = vi.fn().mockResolvedValue('OK');
    const hb = new PresenceHeartbeat(write);
    hb.add('github');
    hb.add('lever');
    await hb.beat();
    expect(write).toHaveBeenCalledWith('leads:workers:source:github', WORKER_HEARTBEAT_TTL_SECONDS);
    expect(write).toHaveBeenCalledWith('leads:workers:source:lever', WORKER_HEARTBEAT_TTL_SECONDS);
    expect(hb.sourceCount).toBe(2);
  });

  it('beats right away when a source is added', async () => {
    const write = vi.fn().mockResolvedValue('OK');
    new PresenceHeartbeat(write).add('remoteok');
    await Promise.resolve();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('does not duplicate a source added twice', async () => {
    const write = vi.fn().mockResolvedValue('OK');
    const hb = new PresenceHeartbeat(write);
    hb.add('github');
    hb.add('github');
    write.mockClear();
    await hb.beat();
    expect(write).toHaveBeenCalledTimes(1);
  });

  it('renews on the interval until stopped', async () => {
    vi.useFakeTimers();
    const write = vi.fn().mockResolvedValue('OK');
    const hb = new PresenceHeartbeat(write, undefined, 1000);
    hb.add('github');
    write.mockClear();
    hb.start();
    hb.start(); // a second start must not create a second timer
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).toHaveBeenCalledTimes(3);
    hb.stop();
    await vi.advanceTimersByTimeAsync(3000);
    expect(write).toHaveBeenCalledTimes(3);
  });

  it('reports a failed write and keeps beating the other sources', async () => {
    const written: string[] = [];
    const write = vi.fn((key: string) => {
      if (key.endsWith(':github')) return Promise.reject(new Error('redis down'));
      written.push(key);
      return Promise.resolve('OK');
    });
    const onError = vi.fn();
    const hb = new PresenceHeartbeat(write, onError);
    hb.add('github');
    hb.add('lever');
    await hb.beat();
    expect(onError).toHaveBeenCalled();
    expect(written).toContain('leads:workers:source:lever');
  });
});
