import { LEAD_EVENTS_CHANNEL, type LeadUpsertedEvent } from '@leads/shared';
import { dueEvents } from './pacer';

export interface PublisherOptions {
  ratePerSecond: number;
  durationMs: number;
  /** Tick interval of the pacing loop. */
  tickMs?: number;
  /** Max events per tick after a stall. */
  maxBurst?: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

export interface PublishResult {
  published: number;
  elapsedMs: number;
  achievedRate: number;
}

export type PublishFn = (channel: string, message: string) => Promise<unknown>;

/**
 * Pushes synthetic `lead.upserted` events straight into the Redis channel the API listens to,
 * exactly where the ingestion worker publishes. `ingestedAt` is stamped at publish time.
 */
export async function runPublisher(
  next: () => LeadUpsertedEvent,
  publish: PublishFn,
  options: PublisherOptions,
): Promise<PublishResult> {
  const now = options.now ?? Date.now;
  const sleep = options.sleep ?? ((ms) => new Promise<void>((r) => setTimeout(r, ms)));
  const tickMs = options.tickMs ?? 10;
  const maxBurst = options.maxBurst ?? Math.max(1, Math.ceil(options.ratePerSecond / 5));
  const started = now();
  let published = 0;

  for (;;) {
    const elapsed = now() - started;
    if (elapsed >= options.durationMs) break;
    const due = dueEvents(options.ratePerSecond, elapsed, published, maxBurst);
    for (let i = 0; i < due; i++) {
      const event = next();
      event.timings.ingestedAt = now();
      await publish(LEAD_EVENTS_CHANNEL, JSON.stringify(event));
      published += 1;
    }
    await sleep(tickMs);
  }

  const elapsedMs = Math.max(1, now() - started);
  return { published, elapsedMs, achievedRate: (published * 1000) / elapsedMs };
}
