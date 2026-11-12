import type { LatencyAck } from '@leads/shared';

/** Latency buckets in seconds, from 5 ms to 60 s. */
export const LATENCY_BUCKETS_SECONDS = [
  0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60,
] as const;

export const PIPELINE_STAGES = [
  'scrape_to_ingest',
  'ingest_to_publish',
  'publish_to_render',
  'scrape_to_screen',
] as const;

export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export interface StageLatency {
  stage: PipelineStage;
  seconds: number;
}

/**
 * Splits one ack into per-stage latencies in seconds.
 *
 * Timestamps come from different clocks (workers, API, browser), so a negative delta means skew,
 * not time travel: that stage is dropped instead of recorded as a bogus zero. A stage that needs
 * `publishedAt` is dropped when the gateway did not stamp it.
 */
export function stageLatencies(ack: LatencyAck): StageLatency[] {
  const { scrapedAt, ingestedAt, publishedAt } = ack.timings;
  const candidates: Array<[PipelineStage, number | undefined]> = [
    ['scrape_to_ingest', ingestedAt - scrapedAt],
    ['ingest_to_publish', publishedAt === undefined ? undefined : publishedAt - ingestedAt],
    ['publish_to_render', publishedAt === undefined ? undefined : ack.renderedAt - publishedAt],
    ['scrape_to_screen', ack.renderedAt - scrapedAt],
  ];
  const out: StageLatency[] = [];
  for (const [stage, ms] of candidates) {
    if (ms === undefined || !Number.isFinite(ms) || ms < 0) continue;
    out.push({ stage, seconds: ms / 1000 });
  }
  return out;
}
