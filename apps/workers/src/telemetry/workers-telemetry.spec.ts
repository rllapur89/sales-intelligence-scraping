import { describe, expect, it } from 'vitest';
import { WorkersTelemetry } from './workers-telemetry';

describe('WorkersTelemetry', () => {
  it('counts finished tasks per source and outcome and times them', async () => {
    const t = new WorkersTelemetry();
    t.taskFinished('github', 'scraped', 0.4);
    t.taskFinished('github', 'failed', 3);
    const text = await t.render();
    expect(text).toContain('leads_scrape_tasks_total{source="github",outcome="scraped"} 1');
    expect(text).toContain('leads_scrape_tasks_total{source="github",outcome="failed"} 1');
    expect(text).toContain('leads_scrape_duration_seconds_count{source="github"} 2');
    t.registry.clear();
  });

  it('tracks rate limits with the paused time in seconds', async () => {
    const t = new WorkersTelemetry();
    t.rateLimited('sec-edgar', 1500);
    t.rateLimited('sec-edgar', 500);
    const text = await t.render();
    expect(text).toContain('leads_scrape_rate_limited_total{source="sec-edgar"} 2');
    expect(text).toContain('leads_scrape_queue_paused_seconds_total{source="sec-edgar"} 2');
    t.registry.clear();
  });

  it('records items found, retries and ingestion results', async () => {
    const t = new WorkersTelemetry();
    t.itemsFound('remoteok', 30);
    t.retried('lever');
    t.ingestionResult('ok');
    t.ingestionResult('error');
    const text = await t.render();
    expect(text).toContain('leads_scrape_items_found_bucket{le="50",source="remoteok"} 1');
    expect(text).toContain('leads_scrape_retries_total{source="lever"} 1');
    expect(text).toContain('leads_ingestion_results_total{result="error"} 1');
    t.registry.clear();
  });
});
