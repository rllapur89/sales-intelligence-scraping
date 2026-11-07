import type { EventTimings, LeadDto, LeadUpsertedEvent } from '@leads/shared';

export interface CoalescedEntry {
  lead: LeadDto;
  timings: EventTimings;
}

export interface CoalescedWindow {
  fromSeq: number;
  toSeq: number;
  /** Latest version per lead id (highest seq wins). */
  entries: Map<string, CoalescedEntry>;
}

/** Collapses a window of events into one entry per lead; returns null for an empty window. */
export function coalesceEvents(events: readonly LeadUpsertedEvent[]): CoalescedWindow | null {
  if (events.length === 0) return null;
  const best = new Map<string, LeadUpsertedEvent>();
  let fromSeq = Infinity;
  let toSeq = -Infinity;
  for (const event of events) {
    fromSeq = Math.min(fromSeq, event.seq);
    toSeq = Math.max(toSeq, event.seq);
    const held = best.get(event.lead.id);
    if (!held || event.seq > held.seq) best.set(event.lead.id, event);
  }
  const entries = new Map<string, CoalescedEntry>();
  for (const [id, event] of best) entries.set(id, { lead: event.lead, timings: event.timings });
  return { fromSeq, toSeq, entries };
}

export interface EventBatcherOptions {
  windowMs: number;
  onFlush: (window: CoalescedWindow) => void;
}

/** Buffers events for `windowMs` after the first one arrives, then flushes one coalesced window. */
export class EventBatcher {
  private buffer: LeadUpsertedEvent[] = [];
  private timer: ReturnType<typeof setTimeout> | null = null;

  constructor(private readonly options: EventBatcherOptions) {}

  add(event: LeadUpsertedEvent): void {
    this.buffer.push(event);
    this.timer ??= setTimeout(() => this.flush(), this.options.windowMs);
  }

  flush(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    const events = this.buffer;
    this.buffer = [];
    const window = coalesceEvents(events);
    if (window) this.options.onFlush(window);
  }

  stop(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.buffer = [];
  }
}
