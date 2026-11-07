import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { LeadBatch } from '@leads/shared';
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
  let outbox: SocketOutbox;

  beforeEach(() => {
    vi.useFakeTimers();
    drained = true;
    sent.length = 0;
    outbox = new SocketOutbox({
      isDrained: () => drained,
      emit: (b) => sent.push(b),
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
});
