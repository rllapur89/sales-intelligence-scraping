export interface FrameStats {
  frames: number;
  durationMs: number;
  /** Average frames per second over the whole run. */
  fps: number;
  /** Frame time percentiles in ms. */
  p50Ms: number;
  p95Ms: number;
  p99Ms: number;
  maxMs: number;
  /** Frames that took longer than 2 x the 60 Hz budget (33.4 ms). */
  droppedFrames: number;
  droppedRatio: number;
}

export const FRAME_BUDGET_MS = 1000 / 60;
export const DROPPED_FRAME_MS = FRAME_BUDGET_MS * 2;

function nearestRank(sorted: readonly number[], p: number): number {
  if (sorted.length === 0) return 0;
  return sorted[Math.max(1, Math.ceil((p / 100) * sorted.length)) - 1] as number;
}

/** Converts `requestAnimationFrame` timestamps (ms) into frame statistics. */
export function frameStats(timestamps: readonly number[]): FrameStats {
  if (timestamps.length < 2) {
    return {
      frames: 0,
      durationMs: 0,
      fps: 0,
      p50Ms: 0,
      p95Ms: 0,
      p99Ms: 0,
      maxMs: 0,
      droppedFrames: 0,
      droppedRatio: 0,
    };
  }
  const deltas: number[] = [];
  for (let i = 1; i < timestamps.length; i++) {
    deltas.push((timestamps[i] as number) - (timestamps[i - 1] as number));
  }
  const durationMs = (timestamps[timestamps.length - 1] as number) - (timestamps[0] as number);
  const sorted = [...deltas].sort((a, b) => a - b);
  const dropped = deltas.filter((d) => d > DROPPED_FRAME_MS).length;
  return {
    frames: deltas.length,
    durationMs,
    fps: durationMs > 0 ? (deltas.length * 1000) / durationMs : 0,
    p50Ms: nearestRank(sorted, 50),
    p95Ms: nearestRank(sorted, 95),
    p99Ms: nearestRank(sorted, 99),
    maxMs: sorted[sorted.length - 1] as number,
    droppedFrames: dropped,
    droppedRatio: dropped / deltas.length,
  };
}
