import { sampleAcks } from './latency-sampler';
import { makeBatch, makeLead } from '../../../testing/factories';

function leads(n: number) {
  return Array.from({ length: n }, (_, i) => makeLead({ id: 'l' + i, seq: i + 1 }));
}

describe('sampleAcks', () => {
  it('samples roughly the configured rate (deterministic random source)', () => {
    const batch = makeBatch(leads(100));
    let i = 0;
    // 0.00, 0.01, ... 0.99: exactly the first 10 values are below 0.1
    const acks = sampleAcks(batch, 5000, { rate: 0.1, max: 100 }, () => (i++ % 100) / 100);
    expect(acks).toHaveLength(10);
  });

  it('copies seq, timings and renderedAt into every ack', () => {
    const batch = makeBatch(leads(3));
    const acks = sampleAcks(batch, 7777, { rate: 1, max: 100 });
    expect(acks).toHaveLength(3);
    expect(acks[1]).toEqual({
      leadId: 'l1',
      seq: 2,
      renderedAt: 7777,
      timings: batch.timings['l1'],
    });
  });

  it('never returns more than max acks', () => {
    const acks = sampleAcks(makeBatch(leads(500)), 1, { rate: 1, max: 100 });
    expect(acks).toHaveLength(100);
  });

  it('returns nothing for rate 0 and skips leads without timings', () => {
    const batch = makeBatch(leads(5));
    expect(sampleAcks(batch, 1, { rate: 0, max: 100 })).toEqual([]);
    delete batch.timings['l0'];
    expect(sampleAcks(batch, 1, { rate: 1, max: 100 }).map(a => a.leadId)).toEqual(['l1', 'l2', 'l3', 'l4']);
  });

  it('returns nothing for an empty batch', () => {
    expect(sampleAcks({ fromSeq: 0, toSeq: 0, leads: [], timings: {} }, 1, { rate: 1, max: 10 })).toEqual([]);
  });
});
