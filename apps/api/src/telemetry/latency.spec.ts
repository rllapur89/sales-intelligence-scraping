import { describe, expect, it } from 'vitest';
import type { LatencyAck } from '@leads/shared';
import { LATENCY_BUCKETS_SECONDS, stageLatencies } from './latency';

function ack(timings: LatencyAck['timings'], renderedAt: number): LatencyAck {
  return { leadId: 'l1', seq: 1, renderedAt, timings };
}

describe('stageLatencies', () => {
  it('splits a full ack into the four stages in seconds', () => {
    const result = stageLatencies(
      ack({ scrapedAt: 1000, ingestedAt: 1500, publishedAt: 2000 }, 2250),
    );
    expect(result).toEqual([
      { stage: 'scrape_to_ingest', seconds: 0.5 },
      { stage: 'ingest_to_publish', seconds: 0.5 },
      { stage: 'publish_to_render', seconds: 0.25 },
      { stage: 'scrape_to_screen', seconds: 1.25 },
    ]);
  });

  it('skips stages that need publishedAt when it is missing', () => {
    const stages = stageLatencies(ack({ scrapedAt: 0, ingestedAt: 100 }, 400)).map((s) => s.stage);
    expect(stages).toEqual(['scrape_to_ingest', 'scrape_to_screen']);
  });

  it('drops negative deltas caused by clock skew', () => {
    const stages = stageLatencies(
      ack({ scrapedAt: 1000, ingestedAt: 1200, publishedAt: 1300 }, 1250),
    ).map((s) => s.stage);
    expect(stages).toEqual(['scrape_to_ingest', 'ingest_to_publish', 'scrape_to_screen']);
  });

  it('keeps a zero delta', () => {
    const result = stageLatencies(ack({ scrapedAt: 5, ingestedAt: 5 }, 5));
    expect(result.every((s) => s.seconds === 0)).toBe(true);
  });

  it('has strictly increasing buckets', () => {
    for (let i = 1; i < LATENCY_BUCKETS_SECONDS.length; i++) {
      expect(LATENCY_BUCKETS_SECONDS[i]!).toBeGreaterThan(LATENCY_BUCKETS_SECONDS[i - 1]!);
    }
  });
});
