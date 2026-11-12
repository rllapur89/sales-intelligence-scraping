import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadBatch, LeadsRetracted } from '@leads/shared';
import type { CoalescedEntry } from './coalescer';
import { makeLead } from './fixtures';
import { SocketOutbox } from './outbox';

const entry = (id: string, seq: number, score = 50): CoalescedEntry => ({
  lead: makeLead(id, { seq, score }),
  timings: { scrapedAt: 1, ingestedAt: 2 },
});

describe('SocketOutbox', () => {
  let drained = true;
  const sent: LeadBatch[] = [];
  const retracted: LeadsRetracted[] = [];
  let outbox: SocketOutbox;

  beforeEach(() => {
    vi.useFakeTimers();
    drained = true;
    sent.length = 0;
    retracted.length = 0;
    outbox = new SocketOutbox({
      isDrained: () => drained,
      emit: (b) => sent.push(b),
      emitRetracted: (r) => retracted.push(r),
      retryMs: 20,
      now: () => 777,
    });
  });
  afterEach(() => {
    outbox.dispose();
    vi.useRealTimers();
  });

  it('sends immediately when drained and stamps publishedAt', () => {
    outbox.offer([entry('a', 1)], 1, 1);
    expect(sent).toHaveLength(1);
    expect(sent[0]?.fromSeq).toBe(1);
    expect(sent[0]?.timings['a']).toEqual({ scrapedAt: 1, ingestedAt: 2, publishedAt: 777 });
    expect(outbox.pendingCount).toBe(0);
  });

  it('merges newer versions while congested and sends one batch once drained', () => {
    drained = false;
    outbox.offer([entry('a', 1, 10), entry('b', 2)], 1, 2);
    outbox.offer([entry('a', 5, 99)], 5, 5);
    outbox.offer([entry('a', 4, 1)], 4, 4);
    expect(sent).toHaveLength(0);
    expect(outbox.pendingCount).toBe(2);

    vi.advanceTimersByTime(60);
    expect(sent).toHaveLength(0);

    drained = true;
    vi.advanceTimersByTime(20);
    expect(sent).toHaveLength(1);
    const batch = sent[0];
    expect(batch?.leads).toHaveLength(2);
    expect(batch?.leads.find((l) => l.id === 'a')?.score).toBe(99);
    expect(batch?.fromSeq).toBe(1);
    expect(batch?.toSeq).toBe(5);
    expect(outbox.pendingCount).toBe(0);
  });

  it('starts a fresh seq range after a send', () => {
    outbox.offer([entry('a', 1)], 1, 1);
    outbox.offer([entry('a', 9)], 9, 9);
    expect(sent.map((b) => [b.fromSeq, b.toSeq])).toEqual([
      [1, 1],
      [9, 9],
    ]);
  });

  it('dispose cancels the pending send', () => {
    drained = false;
    outbox.offer([entry('a', 1)], 1, 1);
    outbox.dispose();
    drained = true;
    vi.advanceTimersByTime(100);
    expect(sent).toHaveLength(0);
  });

  describe('retractions', () => {
    it('sends a retraction immediately when drained', () => {
      outbox.offerRetractions(['a', 'b'], 7);
      expect(retracted).toEqual([{ leadIds: ['a', 'b'], seq: 7 }]);
      expect(sent).toHaveLength(0);
      expect(outbox.pendingRetractionCount).toBe(0);
    });

    it('coalesces retractions while congested and sends one event once drained', () => {
      drained = false;
      outbox.offerRetractions(['a'], 3);
      outbox.offerRetractions(['b', 'a'], 9);
      outbox.offerRetractions(['c'], 5);
      expect(outbox.pendingRetractionCount).toBe(3);
      vi.advanceTimersByTime(60);
      expect(retracted).toHaveLength(0);
      drained = true;
      vi.advanceTimersByTime(20);
      expect(retracted).toEqual([{ leadIds: ['a', 'b', 'c'], seq: 9 }]);
      expect(outbox.pendingRetractionCount).toBe(0);
    });

    it('a lead delivered again cancels its pending retraction', () => {
      drained = false;
      outbox.offerRetractions(['a', 'b'], 4);
      outbox.offer([entry('a', 6)], 6, 6);
      drained = true;
      vi.advanceTimersByTime(20);
      expect(retracted).toEqual([{ leadIds: ['b'], seq: 4 }]);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.leads.map((l) => l.id)).toEqual(['a']);
    });

    it('a retraction replaces a pending delivery of the same lead', () => {
      drained = false;
      outbox.offer([entry('a', 1), entry('b', 2)], 1, 2);
      outbox.offerRetractions(['a'], 3);
      expect(outbox.pendingCount).toBe(1);
      drained = true;
      vi.advanceTimersByTime(20);
      expect(sent).toHaveLength(1);
      expect(sent[0]?.leads.map((l) => l.id)).toEqual(['b']);
      expect(retracted).toEqual([{ leadIds: ['a'], seq: 3 }]);
    });

    it('sends nothing for a delivery that was fully replaced by retractions', () => {
      drained = false;
      outbox.offer([entry('a', 1)], 1, 1);
      outbox.offerRetractions(['a'], 2);
      drained = true;
      vi.advanceTimersByTime(20);
      expect(sent).toHaveLength(0);
      expect(retracted).toEqual([{ leadIds: ['a'], seq: 2 }]);
    });

    it('does not accumulate state while the socket stays congested', () => {
      drained = false;
      for (let i = 0; i < 1000; i++) {
        outbox.offerRetractions(['a', 'b'], i);
        outbox.offer([entry('a', i)], i, i);
      }
      expect(outbox.pendingCount + outbox.pendingRetractionCount).toBeLessThanOrEqual(2);
    });

    it('dispose drops pending retractions', () => {
      drained = false;
      outbox.offerRetractions(['a'], 1);
      outbox.dispose();
      drained = true;
      vi.advanceTimersByTime(100);
      expect(retracted).toHaveLength(0);
    });
  });
});
