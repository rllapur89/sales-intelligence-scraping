import type { LoadTestConfig } from './config';
import type { Summary } from './percentiles';
import type { RecorderSnapshot } from './recorder';

export interface RunFacts {
  startedAt: string;
  /** Clients that completed the handshake. */
  connected: number;
  eventsPublished: number;
  /** Wall-clock seconds of the publishing phase. */
  publishSeconds: number;
  /** Events/s actually achieved by the publisher. */
  achievedRate: number;
  node: string;
  platform: string;
}

function ms(n: number): string {
  return n >= 100 ? n.toFixed(0) : n.toFixed(1);
}

function row(label: string, s: Summary): string {
  return `| ${label} | ${s.count} | ${ms(s.p50)} | ${ms(s.p95)} | ${ms(s.p99)} | ${ms(s.max)} |`;
}

/** Markdown report. It states only what was measured, never an extrapolation. */
export function renderReport(
  config: LoadTestConfig,
  facts: RunFacts,
  snapshot: RecorderSnapshot,
): string {
  const lines = [
    '# Load test report',
    '',
    `Started ${facts.startedAt} on ${facts.platform}, Node ${facts.node}. Numbers come from a local run of this project, not from production.`,
    '',
    '## Setup',
    '',
    `- Clients: ${config.clients} requested, ${facts.connected} connected (${config.users} users, one subscription each)`,
    `- Target rate: ${config.eventsPerSecond} events/s for ${config.durationSeconds} s`,
    `- Achieved rate: ${facts.achievedRate.toFixed(1)} events/s (${facts.eventsPublished} events in ${facts.publishSeconds.toFixed(1)} s)`,
    `- Seed: ${config.seed}`,
    '',
    '## Latency (ms)',
    '',
    '| Leg | Samples | p50 | p95 | p99 | max |',
    '| --- | ---: | ---: | ---: | ---: | ---: |',
    row('scrape to client', snapshot.scrapeToClient),
    row('publish to client', snapshot.publishToClient),
    row('gateway dwell (ingest to publish)', snapshot.gatewayDwell),
    '',
    '`scrape to client` is the scrape-to-screen latency without the render step: the load test clients',
    'do not render, so it ends when the batch reaches the socket handler.',
    '',
    '## Delivery',
    '',
    `- Batches received: ${snapshot.batches}`,
    `- Leads delivered: ${snapshot.leadsDelivered}`,
    `- Batch size p50 / p95 / max: ${ms(snapshot.batchSize.p50)} / ${ms(snapshot.batchSize.p95)} / ${ms(snapshot.batchSize.max)}`,
    `- Out-of-order batches: ${snapshot.outOfOrderBatches}`,
    `- Connect errors: ${snapshot.connectErrors}`,
    `- Unexpected disconnects: ${snapshot.disconnects}`,
    '',
  ];
  return lines.join('\n');
}
