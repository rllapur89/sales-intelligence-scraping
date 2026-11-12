import type { LeadBatch } from '@leads/shared';
import { summarize, type Summary } from './percentiles';

export interface RecorderSnapshot {
  batches: number;
  leadsDelivered: number;
  /** Batch size distribution (leads per batch). */
  batchSize: Summary;
  /** receivedAt - scrapedAt, in ms. */
  scrapeToClient: Summary;
  /** receivedAt - publishedAt, in ms: the server-to-client leg. */
  publishToClient: Summary;
  /** publishedAt - ingestedAt, in ms: time inside the gateway (window + fan-out). */
  gatewayDwell: Summary;
  /** Batches whose `toSeq` did not advance past the previous batch of the same client. */
  outOfOrderBatches: number;
  connectErrors: number;
  disconnects: number;
}

/** Caps stored samples so a long run does not exhaust memory; beyond it, 1 in N is kept. */
export const MAX_SAMPLES = 1_000_000;

class Samples {
  private values: number[] = [];
  private seen = 0;

  constructor(private readonly rng: () => number) {}

  add(v: number): void {
    this.seen += 1;
    if (this.values.length < MAX_SAMPLES) {
      this.values.push(v);
      return;
    }
    // Reservoir sampling keeps a uniform sample of everything seen.
    const j = Math.floor(this.rng() * this.seen);
    if (j < MAX_SAMPLES) this.values[j] = v;
  }

  summary(): Summary {
    return summarize(this.values);
  }
}

/** Aggregates what every client sees. One instance is shared by the whole swarm. */
export class LatencyRecorder {
  private batches = 0;
  private leads = 0;
  private outOfOrder = 0;
  private connectErrors = 0;
  private disconnects = 0;
  private readonly batchSize: Samples;
  private readonly scrapeToClient: Samples;
  private readonly publishToClient: Samples;
  private readonly gatewayDwell: Samples;
  private readonly lastSeqByClient = new Map<string, number>();

  constructor(rng: () => number = Math.random) {
    this.batchSize = new Samples(rng);
    this.scrapeToClient = new Samples(rng);
    this.publishToClient = new Samples(rng);
    this.gatewayDwell = new Samples(rng);
  }

  recordBatch(clientId: string, batch: LeadBatch, receivedAt: number): void {
    this.batches += 1;
    this.leads += batch.leads.length;
    this.batchSize.add(batch.leads.length);
    const previous = this.lastSeqByClient.get(clientId);
    if (previous !== undefined && batch.toSeq <= previous) this.outOfOrder += 1;
    this.lastSeqByClient.set(clientId, batch.toSeq);

    for (const lead of batch.leads) {
      const t = batch.timings[lead.id];
      if (!t) continue;
      this.scrapeToClient.add(receivedAt - t.scrapedAt);
      if (t.publishedAt !== undefined) {
        this.publishToClient.add(receivedAt - t.publishedAt);
        this.gatewayDwell.add(t.publishedAt - t.ingestedAt);
      }
    }
  }

  recordConnectError(): void {
    this.connectErrors += 1;
  }

  recordDisconnect(): void {
    this.disconnects += 1;
  }

  snapshot(): RecorderSnapshot {
    return {
      batches: this.batches,
      leadsDelivered: this.leads,
      batchSize: this.batchSize.summary(),
      scrapeToClient: this.scrapeToClient.summary(),
      publishToClient: this.publishToClient.summary(),
      gatewayDwell: this.gatewayDwell.summary(),
      outOfOrderBatches: this.outOfOrder,
      connectErrors: this.connectErrors,
      disconnects: this.disconnects,
    };
  }
}
