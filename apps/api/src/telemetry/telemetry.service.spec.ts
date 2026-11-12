import { afterEach, describe, expect, it } from 'vitest';
import { TelemetryService } from './telemetry.service';

describe('TelemetryService', () => {
  const services: TelemetryService[] = [];
  function make(): TelemetryService {
    const s = new TelemetryService();
    services.push(s);
    return s;
  }
  afterEach(() => {
    for (const s of services.splice(0)) s.registry.clear();
  });

  it('renders stage histograms with the stage label', async () => {
    const t = make();
    t.observeStage('scrape_to_screen', 0.3);
    t.observeStage('scrape_to_screen', 3);
    const text = await t.render();
    expect(text).toContain('leads_pipeline_latency_seconds_count{stage="scrape_to_screen"} 2');
    expect(text).toContain(
      'leads_pipeline_latency_seconds_bucket{le="0.5",stage="scrape_to_screen"} 1',
    );
  });

  it('counts events, invalid events and acks', async () => {
    const t = make();
    t.countEvent();
    t.countEvent();
    t.countInvalidEvent();
    t.countAcks(5);
    const text = await t.render();
    expect(text).toContain('leads_events_received_total 2');
    expect(text).toContain('leads_events_invalid_total 1');
    expect(text).toContain('leads_latency_acks_total 5');
  });

  it('tracks sockets and queue depth as gauges that can go down', async () => {
    const t = make();
    t.setSockets(10);
    t.setSockets(7);
    t.setQueueDepth('scrape-github', 'waiting', 4);
    const text = await t.render();
    expect(text).toContain('leads_connected_sockets 7');
    expect(text).toContain('leads_queue_jobs{queue="scrape-github",state="waiting"} 4');
  });

  it('records batch sizes', async () => {
    const t = make();
    t.observeBatch(30);
    const text = await t.render();
    expect(text).toContain('leads_batch_size_bucket{le="50"} 1');
    expect(text).toContain('leads_batch_size_bucket{le="25"} 0');
  });

  it('exposes the Prometheus content type', () => {
    expect(make().contentType).toContain('text/plain');
  });
});
