import { Injectable, Logger } from '@nestjs/common';
import type { EventTimings, LatencyAck } from '@leads/shared';

export const MAX_ACKS_PER_EMIT = 100;

function isFiniteNumber(v: unknown): v is number {
  return typeof v === 'number' && Number.isFinite(v);
}

function isTimings(v: unknown): v is EventTimings {
  if (typeof v !== 'object' || v === null) return false;
  const t = v as Record<string, unknown>;
  return (
    isFiniteNumber(t['scrapedAt']) &&
    isFiniteNumber(t['ingestedAt']) &&
    (t['publishedAt'] === undefined || isFiniteNumber(t['publishedAt']))
  );
}

function isAck(v: unknown): v is LatencyAck {
  if (typeof v !== 'object' || v === null) return false;
  const a = v as Record<string, unknown>;
  return (
    typeof a['leadId'] === 'string' &&
    isFiniteNumber(a['seq']) &&
    isFiniteNumber(a['renderedAt']) &&
    isTimings(a['timings'])
  );
}

/** Client input is untrusted: not an array or > 100 items -> nothing; malformed items dropped. */
export function validateAcks(input: unknown): LatencyAck[] {
  if (!Array.isArray(input) || input.length > MAX_ACKS_PER_EMIT) return [];
  return input.filter(isAck);
}

/** Receives validated latency acks. Phase 5 replaces the implementation with Prometheus. */
export abstract class AckSink {
  abstract record(userId: string, acks: readonly LatencyAck[]): void;
}

@Injectable()
export class InMemoryAckSink extends AckSink {
  private readonly logger = new Logger('AckSink');
  private total = 0;

  get count(): number {
    return this.total;
  }

  record(userId: string, acks: readonly LatencyAck[]): void {
    if (acks.length === 0) return;
    this.total += acks.length;
    const last = acks[acks.length - 1];
    if (last) {
      this.logger.debug(
        `user=${userId} acks=${acks.length} total=${this.total} lastRenderLatencyMs=${
          last.renderedAt - (last.timings.scrapedAt ?? 0)
        }`,
      );
    }
  }
}
