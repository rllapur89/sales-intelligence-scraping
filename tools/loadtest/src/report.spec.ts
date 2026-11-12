import { describe, expect, it } from 'vitest';
import { DEFAULTS } from './config';
import { summarize } from './percentiles';
import type { RecorderSnapshot } from './recorder';
import { renderReport, type RunFacts } from './report';

const facts: RunFacts = {
  startedAt: '2026-01-01T00:00:00.000Z',
  connected: 990,
  eventsPublished: 29_900,
  publishSeconds: 60,
  achievedRate: 498.3,
  node: 'v22.0.0',
  platform: 'win32 x64',
};

const snapshot: RecorderSnapshot = {
  batches: 100,
  leadsDelivered: 5000,
  batchSize: summarize([10, 20, 30]),
  scrapeToClient: summarize([100, 200, 300, 400]),
  publishToClient: summarize([5, 6, 7]),
  gatewayDwell: summarize([180, 190, 200]),
  outOfOrderBatches: 0,
  connectErrors: 10,
  disconnects: 1,
};

describe('renderReport', () => {
  const text = renderReport({ ...DEFAULTS, clients: 1000 }, facts, snapshot);

  it('states the requested and connected clients and the achieved rate', () => {
    expect(text).toContain('1000 requested, 990 connected');
    expect(text).toContain('Achieved rate: 498.3 events/s');
  });

  it('renders one table row per latency leg with percentiles', () => {
    expect(text).toContain('| scrape to client | 4 | 200 | 400 | 400 | 400 |');
    expect(text).toContain('| publish to client | 3 | 6.0 | 7.0 | 7.0 | 7.0 |');
  });

  it('reports delivery counters and failures', () => {
    expect(text).toContain('Leads delivered: 5000');
    expect(text).toContain('Connect errors: 10');
    expect(text).toContain('Unexpected disconnects: 1');
  });

  it('says the numbers come from a local run', () => {
    expect(text).toContain('local run of this project');
  });
});
