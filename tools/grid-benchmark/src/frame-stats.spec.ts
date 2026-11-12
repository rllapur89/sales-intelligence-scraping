import { describe, expect, it } from 'vitest';
import { DROPPED_FRAME_MS, frameStats } from './frame-stats';

function steady(count: number, stepMs: number): number[] {
  return Array.from({ length: count }, (_, i) => i * stepMs);
}

describe('frameStats', () => {
  it('reports about 60 fps for 16.67 ms frames', () => {
    const s = frameStats(steady(121, 1000 / 60));
    expect(s.frames).toBe(120);
    expect(s.fps).toBeCloseTo(60, 1);
    expect(s.p50Ms).toBeCloseTo(16.67, 1);
    expect(s.droppedFrames).toBe(0);
  });

  it('counts frames slower than two budgets as dropped', () => {
    const ts = [0, 16, 32, 100, 116];
    const s = frameStats(ts);
    expect(s.droppedFrames).toBe(1);
    expect(s.droppedRatio).toBeCloseTo(0.25);
    expect(s.maxMs).toBe(68);
    expect(68).toBeGreaterThan(DROPPED_FRAME_MS);
  });

  it('exposes tail percentiles', () => {
    const ts = [0];
    for (let i = 0; i < 99; i++) ts.push((ts[ts.length - 1] as number) + 16);
    ts.push((ts[ts.length - 1] as number) + 200);
    const s = frameStats(ts);
    expect(s.p50Ms).toBe(16);
    expect(s.p99Ms).toBe(16);
    expect(s.maxMs).toBe(200);
  });

  it('returns zeros when there are fewer than two timestamps', () => {
    expect(frameStats([]).fps).toBe(0);
    expect(frameStats([5]).frames).toBe(0);
  });
});
