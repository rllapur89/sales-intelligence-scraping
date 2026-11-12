import { afterEach, describe, expect, it } from 'vitest';
import type { LatencyAck } from '@leads/shared';
import { PromAckSink } from './prom-ack-sink';
import { TelemetryService } from './telemetry.service';

const ack: LatencyAck = {
  leadId: 'l1',
  seq: 3,
  renderedAt: 3000,
  timings: { scrapedAt: 1000, ingestedAt: 1200, publishedAt: 2000 },
};

describe('PromAckSink', () => {
  const telemetry = new TelemetryService();
  afterEach(() => telemetry.registry.resetMetrics());

  it('records every stage of every ack', async () => {
    new PromAckSink(telemetry).record('u1', [ack, ack]);
    const text = await telemetry.render();
    expect(text).toContain('leads_latency_acks_total 2');
    expect(text).toContain('leads_pipeline_latency_seconds_count{stage="scrape_to_screen"} 2');
    expect(text).toContain('leads_pipeline_latency_seconds_count{stage="publish_to_render"} 2');
  });

  it('does nothing for an empty batch', async () => {
    new PromAckSink(telemetry).record('u1', []);
    const text = await telemetry.render();
    expect(text).toContain('leads_latency_acks_total 0');
  });
});
