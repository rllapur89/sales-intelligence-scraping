import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { coalesceEvents, EventBatcher, type CoalescedWindow } from './coalescer';
import { makeEvent, makeLead } from './fixtures';

describe('coalesceEvents', () => {
  it('returns null for an empty window', () => {
    expect(coalesceEvents([])).toBeNull();
  });

  it('keeps the highest seq per lead regardless of arrival order', () => {
    const a = makeLead('a');
    const window = coalesceEvents([
      makeEvent(5, { ...a, score: 90 }),
      makeEvent(3, { ...a, score: 10 }),
      makeEvent(4, makeLead('b')),
    ]);
    expect(window?.fromSeq).toBe(3);
    expect(window?.toSeq).toBe(5);
    expect(window?.entries.size).toBe(2);
    expect(window?.entries.get('a')?.lead.score).toBe(90);
    expect(window?.entries.get('a')?.timings.scrapedAt).toBe(1000);
  });
});

describe('EventBatcher', () => {
  const flushed: CoalescedWindow[] = [];
  let batcher: EventBatcher;

  beforeEach(() => {
    vi.useFakeTimers();
    flushed.length = 0;
    batcher = new EventBatcher({ windowMs: 200, onFlush: (w) => flushed.push(w) });
  });
  afterEach(() => {
    batcher.stop();
    vi.useRealTimers();
  });

  it('flushes one coalesced window after the batch window', () => {
    batcher.add(makeEvent(1, makeLead('a')));
    vi.advanceTimersByTime(150);
    batcher.add(makeEvent(2, makeLead('a')));
    batcher.add(makeEvent(3, makeLead('b')));
    expect(flushed).toHaveLength(0);
    vi.advanceTimersByTime(50);
    expect(flushed).toHaveLength(1);
    expect(flushed[0]?.entries.size).toBe(2);
    expect(flushed[0]?.entries.get('a')?.lead.seq).toBe(2);
  });

  it('starts a new window for later events and never flushes empty', () => {
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(0);
    batcher.add(makeEvent(1, makeLead('a')));
    vi.advanceTimersByTime(200);
    batcher.add(makeEvent(2, makeLead('a')));
    vi.advanceTimersByTime(200);
    expect(flushed.map((w) => w.toSeq)).toEqual([1, 2]);
  });

  it('stop drops buffered events', () => {
    batcher.add(makeEvent(1, makeLead('a')));
    batcher.stop();
    vi.advanceTimersByTime(1000);
    expect(flushed).toHaveLength(0);
  });
});
