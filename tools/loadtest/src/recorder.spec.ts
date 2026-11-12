import { describe, expect, it } from 'vitest';
import type { LeadBatch, LeadDto } from '@leads/shared';
import { LatencyRecorder } from './recorder';

function lead(id: string): LeadDto {
  return { id } as LeadDto;
}

function batch(over: Partial<LeadBatch> & { ids?: string[] } = {}): LeadBatch {
  const ids = over.ids ?? ['a'];
  return {
    fromSeq: 1,
    toSeq: 2,
    leads: ids.map(lead),
    timings: Object.fromEntries(
      ids.map((id) => [id, { scrapedAt: 1000, ingestedAt: 1100, publishedAt: 1400 }]),
    ),
    ...over,
  };
}

describe('LatencyRecorder', () => {
  it('derives the three latency legs per delivered lead', () => {
    const r = new LatencyRecorder();
    r.recordBatch('c1', batch(), 1900);
    const s = r.snapshot();
    expect(s.leadsDelivered).toBe(1);
    expect(s.scrapeToClient.p50).toBe(900);
    expect(s.publishToClient.p50).toBe(500);
    expect(s.gatewayDwell.p50).toBe(300);
  });

  it('counts batches and tracks the batch size distribution', () => {
    const r = new LatencyRecorder();
    r.recordBatch('c1', batch({ ids: ['a', 'b', 'c'] }), 2000);
    r.recordBatch('c1', batch({ ids: ['a'], fromSeq: 3, toSeq: 4 }), 2000);
    const s = r.snapshot();
    expect(s.batches).toBe(2);
    expect(s.leadsDelivered).toBe(4);
    expect(s.batchSize.max).toBe(3);
  });

  it('skips timings that are missing and publishedAt-dependent legs without it', () => {
    const r = new LatencyRecorder();
    const b = batch({ ids: ['a', 'b'] });
    delete b.timings['b'];
    b.timings['a'] = { scrapedAt: 1000, ingestedAt: 1100 };
    r.recordBatch('c1', b, 2000);
    const s = r.snapshot();
    expect(s.scrapeToClient.count).toBe(1);
    expect(s.publishToClient.count).toBe(0);
  });

  it('flags batches that do not advance past the previous toSeq of the same client', () => {
    const r = new LatencyRecorder();
    r.recordBatch('c1', batch({ fromSeq: 1, toSeq: 5 }), 2000);
    r.recordBatch('c1', batch({ fromSeq: 3, toSeq: 4 }), 2000);
    r.recordBatch('c2', batch({ fromSeq: 3, toSeq: 4 }), 2000);
    expect(r.snapshot().outOfOrderBatches).toBe(1);
  });

  it('counts connection problems', () => {
    const r = new LatencyRecorder();
    r.recordConnectError();
    r.recordDisconnect();
    r.recordDisconnect();
    expect(r.snapshot()).toMatchObject({ connectErrors: 1, disconnects: 2 });
  });
});
