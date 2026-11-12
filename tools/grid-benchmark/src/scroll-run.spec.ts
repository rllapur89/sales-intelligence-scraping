import { describe, expect, it } from 'vitest';
import { scrollRun, type ScrollEnv } from './scroll-run';

function fakeEnv(frameMs: number): ScrollEnv & { time: () => number } {
  let t = 0;
  const queue: Array<(ts: number) => void> = [];
  const env = {
    now: () => t,
    time: () => t,
    raf: (cb: (ts: number) => void) => {
      queue.push(cb);
      // Run the frame "asynchronously" but deterministically.
      queueMicrotask(() => {
        t += frameMs;
        queue.shift()?.(t);
      });
    },
  };
  return env;
}

const el = (scrollHeight: number, clientHeight: number) => ({
  scrollTop: 0,
  scrollHeight,
  clientHeight,
});

describe('scrollRun', () => {
  it('records one timestamp per frame for the requested duration', async () => {
    const result = await scrollRun(el(10_000, 500), 160, 40, fakeEnv(16), () => null);
    expect(result.timestamps).toHaveLength(10);
    expect(result.timestamps[1]! - result.timestamps[0]!).toBe(16);
  });

  it('scrolls down by the step each frame', async () => {
    const target = el(100_000, 500);
    await scrollRun(target, 64, 50, fakeEnv(16), () => null);
    expect(target.scrollTop).toBe(200);
  });

  it('bounces at the bottom and at the top', async () => {
    const target = el(600, 500); // max scroll is 100
    const result = await scrollRun(target, 160, 60, fakeEnv(16), () => null);
    expect(target.scrollTop).toBeLessThanOrEqual(100);
    expect(target.scrollTop).toBeGreaterThanOrEqual(0);
    expect(result.scrolledPx).toBeGreaterThan(100);
  });

  it('reads the heap before and after', async () => {
    const heaps = [1000, 2500];
    const result = await scrollRun(el(5000, 500), 32, 10, fakeEnv(16), () => heaps.shift() ?? null);
    expect(result.heapBefore).toBe(1000);
    expect(result.heapAfter).toBe(2500);
  });
});
