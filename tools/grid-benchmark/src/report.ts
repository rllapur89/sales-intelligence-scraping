import type { FrameStats } from './frame-stats';

export interface Scenario {
  rows: number;
  stats: FrameStats;
  scrolledPx: number;
  /** JS heap in bytes before and after the scroll; null when the browser does not expose it. */
  heapBefore: number | null;
  heapAfter: number | null;
}

export interface BenchmarkFacts {
  startedAt: string;
  browser: string;
  platform: string;
  url: string;
  durationMs: number;
}

export function mb(bytes: number | null): string {
  return bytes === null ? 'n/a' : (bytes / (1024 * 1024)).toFixed(1);
}

function f(n: number, digits = 1): string {
  return n.toFixed(digits);
}

/** Markdown table of every scenario. States only what was measured. */
export function renderBenchmark(facts: BenchmarkFacts, scenarios: readonly Scenario[]): string {
  const lines = [
    '# Grid benchmark',
    '',
    `Started ${facts.startedAt}. ${facts.browser} on ${facts.platform}, ${facts.url}, ${facts.durationMs / 1000} s of continuous scrolling per scenario. Numbers come from a local run of this project.`,
    '',
    '| Rows | FPS | Frame p50 (ms) | p95 | p99 | max | Dropped frames | Heap before (MB) | Heap after (MB) |',
    '| ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: | ---: |',
  ];
  for (const s of scenarios) {
    const st = s.stats;
    lines.push(
      `| ${s.rows} | ${f(st.fps)} | ${f(st.p50Ms)} | ${f(st.p95Ms)} | ${f(st.p99Ms)} | ${f(st.maxMs)} | ${st.droppedFrames} (${f(st.droppedRatio * 100)}%) | ${mb(s.heapBefore)} | ${mb(s.heapAfter)} |`,
    );
  }
  lines.push('', 'A dropped frame is one that took longer than two 60 Hz budgets (33.4 ms).', '');
  return lines.join('\n');
}
