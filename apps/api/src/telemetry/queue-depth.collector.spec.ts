import { describe, expect, it, vi } from 'vitest';
import { collectQueueDepth, QUEUE_STATES, type CountableQueue } from './queue-depth.collector';

describe('collectQueueDepth', () => {
  it('sets one gauge per queue and state, defaulting missing states to 0', async () => {
    const queue: CountableQueue = {
      name: 'scrape-github',
      getJobCounts: vi.fn().mockResolvedValue({ waiting: 3, active: 1 }),
    };
    const setQueueDepth = vi.fn();
    await collectQueueDepth([queue], { setQueueDepth });
    expect(queue.getJobCounts).toHaveBeenCalledWith(...QUEUE_STATES);
    expect(setQueueDepth).toHaveBeenCalledTimes(QUEUE_STATES.length);
    expect(setQueueDepth).toHaveBeenCalledWith('scrape-github', 'waiting', 3);
    expect(setQueueDepth).toHaveBeenCalledWith('scrape-github', 'delayed', 0);
  });

  it('covers every queue it is given', async () => {
    const mk = (name: string): CountableQueue => ({
      name,
      getJobCounts: vi.fn().mockResolvedValue({}),
    });
    const setQueueDepth = vi.fn();
    await collectQueueDepth([mk('a'), mk('b')], { setQueueDepth });
    expect(setQueueDepth).toHaveBeenCalledTimes(QUEUE_STATES.length * 2);
  });

  it('propagates a Redis failure so the caller can log it', async () => {
    const queue: CountableQueue = {
      name: 'q',
      getJobCounts: vi.fn().mockRejectedValue(new Error('redis down')),
    };
    await expect(collectQueueDepth([queue], { setQueueDepth: vi.fn() })).rejects.toThrow(
      'redis down',
    );
  });
});
