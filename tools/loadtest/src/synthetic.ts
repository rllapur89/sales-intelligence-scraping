import { SIGNAL_TYPES, type LeadDto, type LeadUpsertedEvent, type SourceKey } from '@leads/shared';
import { INDUSTRIES, REGIONS } from './profiles';
import { pick, pickMany } from './rng';

/** Far above any real DB sequence, so synthetic events never look like real ones. */
export const SYNTHETIC_SEQ_BASE = 1_000_000_000;
export const LEAD_POOL_SIZE = 5000;

const SOURCES: readonly SourceKey[] = ['greenhouse', 'lever', 'remoteok', 'github', 'sec-edgar'];

/**
 * Generates `lead.upserted` events. Lead ids come from a fixed pool, so the same lead is updated
 * many times (as in production) and the coalescer has something to merge.
 */
export class SyntheticLeads {
  private seq = SYNTHETIC_SEQ_BASE;

  constructor(
    private readonly rng: () => number,
    private readonly now: () => number = Date.now,
    private readonly poolSize: number = LEAD_POOL_SIZE,
  ) {}

  next(): LeadUpsertedEvent {
    const n = Math.floor(this.rng() * this.poolSize);
    const id = `loadtest-${n}`;
    const signalTypes = pickMany(this.rng, SIGNAL_TYPES, 1 + Math.floor(this.rng() * 3));
    const scrapedAt = this.now();
    this.seq += 1;
    const lead: LeadDto = {
      id,
      company: {
        id: `c-${id}`,
        domain: `${id}.loadtest.invalid`,
        name: `Loadtest Company ${n}`,
        industry: pick(this.rng, INDUSTRIES),
        region: pick(this.rng, REGIONS),
        size: null,
        description: null,
        techHints: [],
      },
      score: Math.floor(this.rng() * 101),
      stage: 'new',
      signalTypes,
      signalCount: signalTypes.length,
      seq: this.seq,
      updatedAt: new Date(scrapedAt).toISOString(),
    };
    return {
      type: 'lead.upserted',
      seq: this.seq,
      source: pick(this.rng, SOURCES),
      lead,
      // ingestedAt is stamped right before publishing, see the publisher.
      timings: { scrapedAt, ingestedAt: scrapedAt },
    };
  }
}
