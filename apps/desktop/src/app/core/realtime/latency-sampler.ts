import type { LatencyAck, LeadBatch } from '@leads/shared';

export interface SamplerOptions {
  /** Fraction of leads sampled, 0-1. */
  rate: number;
  /** Maximum number of acks returned. */
  max: number;
}

/**
 * Picks a random sample of the batch's leads and builds their `latency:ack` entries. Leads without
 * timings are skipped. Pure: the random source is injectable.
 */
export function sampleAcks(
  batch: LeadBatch,
  renderedAt: number,
  options: SamplerOptions,
  random: () => number = Math.random
): LatencyAck[] {
  const acks: LatencyAck[] = [];
  if (options.rate <= 0 || options.max <= 0) return acks;
  for (const lead of batch.leads) {
    if (acks.length >= options.max) break;
    const timings = batch.timings[lead.id];
    if (!timings) continue;
    if (random() >= options.rate) continue;
    acks.push({ leadId: lead.id, seq: lead.seq, renderedAt, timings });
  }
  return acks;
}
