import type { EventTimings, LeadBatch, LeadDto } from '@leads/shared';
import type { CoalescedEntry } from './coalescer';

export interface OutboxOptions {
  /** True when the socket's outbound buffer is below the threshold. */
  isDrained: () => boolean;
  emit: (batch: LeadBatch) => void;
  /** Delay before re-checking a congested socket. */
  retryMs?: number;
  now?: () => number;
}

/**
 * Per-socket backpressure buffer. While the socket is not drained, newer versions of the same
 * lead replace older pending ones instead of queueing another batch; the merged batch goes out
 * on a later tick once the socket drains.
 */
export class SocketOutbox {
  private readonly pending = new Map<string, CoalescedEntry>();
  private fromSeq = Infinity;
  private toSeq = -Infinity;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly retryMs: number;
  private readonly now: () => number;

  constructor(private readonly options: OutboxOptions) {
    this.retryMs = options.retryMs ?? 20;
    this.now = options.now ?? Date.now;
  }

  get pendingCount(): number {
    return this.pending.size;
  }

  /** Merges entries (newer seq wins per lead) and sends now if drained, else on a later tick. */
  offer(entries: Iterable<CoalescedEntry>, fromSeq: number, toSeq: number): void {
    for (const entry of entries) {
      const held = this.pending.get(entry.lead.id);
      if (!held || entry.lead.seq >= held.lead.seq) this.pending.set(entry.lead.id, entry);
    }
    this.fromSeq = Math.min(this.fromSeq, fromSeq);
    this.toSeq = Math.max(this.toSeq, toSeq);
    if (this.timer) return;
    if (this.options.isDrained()) this.send();
    else this.schedule();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending.size === 0) return;
      if (this.options.isDrained()) this.send();
      else this.schedule();
    }, this.retryMs);
  }

  private send(): void {
    if (this.pending.size === 0) return;
    const leads: LeadDto[] = [];
    const timings: Record<string, EventTimings> = {};
    const publishedAt = this.now();
    for (const [id, entry] of this.pending) {
      leads.push(entry.lead);
      timings[id] = { ...entry.timings, publishedAt };
    }
    const batch: LeadBatch = { fromSeq: this.fromSeq, toSeq: this.toSeq, leads, timings };
    this.pending.clear();
    this.fromSeq = Infinity;
    this.toSeq = -Infinity;
    this.options.emit(batch);
  }
}
