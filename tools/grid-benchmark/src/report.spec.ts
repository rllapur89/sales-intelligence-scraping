import { describe, expect, it } from 'vitest';
import { frameStats } from './frame-stats';
import { mb, renderBenchmark, type Scenario } from './report';

const steady = Array.from({ length: 61 }, (_, i) => i * 16);
const scenario = (rows: number, heapAfter: number | null): Scenario => ({
  rows,
  stats: frameStats(steady),
  scrolledPx: 1000,
  heapBefore: 50 * 1024 * 1024,
  heapAfter,
});
const facts = {
  startedAt: '2026-01-01T00:00:00Z',
  browser: 'Chromium 130',
  platform: 'win32 x64',
  url: 'http://localhost:4200',
  durationMs: 10_000,
};

describe('mb', () => {
  it('formats bytes as megabytes and null as n/a', () => {
    expect(mb(1024 * 1024)).toBe('1.0');
    expect(mb(null)).toBe('n/a');
  });
});

describe('renderBenchmark', () => {
  it('renders one row per scenario with the row count first', () => {
    const text = renderBenchmark(facts, [scenario(1200, 60 * 1024 * 1024), scenario(50000, null)]);
    expect(text).toContain('| 1200 | 62.5 |');
    expect(text).toContain('| 50000 | 62.5 |');
    expect(text).toContain('| 50.0 | n/a |');
  });

  it('states that the numbers come from a local run', () => {
    expect(renderBenchmark(facts, [])).toContain('local run of this project');
  });

  it('explains what a dropped frame is', () => {
    expect(renderBenchmark(facts, [])).toContain('33.4 ms');
  });
});
