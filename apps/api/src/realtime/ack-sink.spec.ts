import { describe, expect, it } from 'vitest';
import type { LatencyAck } from '@leads/shared';
import { InMemoryAckSink, validateAcks } from './ack-sink';

const ack = (over: Record<string, unknown> = {}): unknown => ({
  leadId: 'a',
  seq: 1,
  renderedAt: 3000,
  timings: { scrapedAt: 1000, ingestedAt: 2000, publishedAt: 2500 },
  ...over,
});

describe('validateAcks', () => {
  it('accepts well-formed acks', () => {
    expect(validateAcks([ack(), ack({ leadId: 'b' })])).toHaveLength(2);
  });

  it('ignores anything that is not an array', () => {
    expect(validateAcks(undefined)).toEqual([]);
    expect(validateAcks({ leadId: 'a' })).toEqual([]);
    expect(validateAcks('x')).toEqual([]);
  });

  it('accepts exactly 100 items and rejects 101', () => {
    expect(validateAcks(Array.from({ length: 100 }, () => ack()))).toHaveLength(100);
    expect(validateAcks(Array.from({ length: 101 }, () => ack()))).toEqual([]);
  });

  it('drops malformed items but keeps the valid ones', () => {
    const out = validateAcks([
      ack(),
      null,
      ack({ seq: '1' }),
      ack({ renderedAt: Number.NaN }),
      ack({ leadId: 5 }),
      ack({ timings: { scrapedAt: 1 } }),
    ]);
    expect(out).toHaveLength(1);
  });
});

describe('InMemoryAckSink', () => {
  it('counts recorded acks', () => {
    const sink = new InMemoryAckSink();
    sink.record('u', validateAcks([ack(), ack()]) as LatencyAck[]);
    sink.record('u', []);
    expect(sink.count).toBe(2);
  });
});
