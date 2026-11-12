import type { EventTimings, LeadBatch, LeadDto, LeadsRetracted } from '@leads/shared';
import type { CoalescedEntry } from './coalescer';

export interface OutboxOptions {
  /** True when the socket's outbound buffer is below the threshold. */
  isDrained: () => boolean;
  emit: (batch: LeadBatch) => void;
  emitRetracted: (retraction: LeadsRetracted) => void;
  /** Delay before re-checking a congested socket. */
  retryMs?: number;
  now?: () => number;
}

/**
 * Per-socket backpressure buffer. While the socket is not drained, newer versions of the same
 * lead replace older pending ones instead of queueing another batch; the merged batch goes out
 * on a later tick once the socket drains.
 *
 * Retractions share the path and the same rule: per lead id the latest state wins. A pending
 * retraction is cancelled when the lead is delivered again, and a pending delivery is dropped
 * when the lead is retracted afterwards. Pending state is therefore at most one entry per lead id
 * (and retractions only exist for ids the hub holds, which is itself bounded).
 */
export class SocketOutbox {
  private readonly pending = new Map<string, CoalescedEntry>();
  private readonly pendingRetractions = new Set<string>();
  private fromSeq = Infinity;
  private toSeq = -Infinity;
  private retractSeq = -Infinity;
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

  get pendingRetractionCount(): number {
    return this.pendingRetractions.size;
  }

  /** Merges entries (newer seq wins per lead) and sends now if drained, else on a later tick. */
  offer(entries: Iterable<CoalescedEntry>, fromSeq: number, toSeq: number): void {
    for (const entry of entries) {
      const id = entry.lead.id;
      // Delivered again after a retraction was queued: the lead is back, cancel the retraction.
      this.pendingRetractions.delete(id);
      const held = this.pending.get(id);
      if (!held || entry.lead.seq >= held.lead.seq) this.pending.set(id, entry);
    }
    this.fromSeq = Math.min(this.fromSeq, fromSeq);
    this.toSeq = Math.max(this.toSeq, toSeq);
    this.flushOrSchedule();
  }

  /** Queues retractions (a retraction replaces a not yet sent delivery of the same lead). */
  offerRetractions(leadIds: Iterable<string>, seq: number): void {
    for (const id of leadIds) {
      this.pending.delete(id);
      this.pendingRetractions.add(id);
    }
    this.retractSeq = Math.max(this.retractSeq, seq);
    if (this.pending.size === 0) {
      this.fromSeq = Infinity;
      this.toSeq = -Infinity;
    }
    this.flushOrSchedule();
  }

  dispose(): void {
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.pending.clear();
    this.pendingRetractions.clear();
  }

  private flushOrSchedule(): void {
    if (this.timer) return;
    if (this.options.isDrained()) this.send();
    else this.schedule();
  }

  private schedule(): void {
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.pending.size === 0 && this.pendingRetractions.size === 0) return;
      if (this.options.isDrained()) this.send();
      else this.schedule();
    }, this.retryMs);
  }

  private send(): void {
    if (this.pending.size > 0) this.sendBatch();
    if (this.pendingRetractions.size > 0) this.sendRetractions();
  }

  private sendBatch(): void {
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

  private sendRetractions(): void {
    const retraction: LeadsRetracted = {
      leadIds: [...this.pendingRetractions],
      seq: this.retractSeq,
    };
    this.pendingRetractions.clear();
    this.retractSeq = -Infinity;
    this.options.emitRetracted(retraction);
  }
}
