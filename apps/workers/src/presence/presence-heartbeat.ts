import {
  WORKER_HEARTBEAT_INTERVAL_MS,
  WORKER_HEARTBEAT_TTL_SECONDS,
  workerPresenceKey,
  type SourceKey,
} from '@leads/shared';

/** The one Redis command the heartbeat needs: `SET key value EX ttl`. */
export type PresenceWriter = (key: string, ttlSeconds: number) => Promise<unknown>;

/**
 * Tells the API which sources have a live worker. Each beat renews one key per source with a TTL, so
 * a crashed process disappears from the list within `WORKER_HEARTBEAT_TTL_SECONDS` without any
 * explicit cleanup.
 */
export class PresenceHeartbeat {
  private timer: ReturnType<typeof setInterval> | null = null;
  private readonly sources = new Set<SourceKey>();

  constructor(
    private readonly write: PresenceWriter,
    private readonly onError: (err: unknown) => void = () => undefined,
    private readonly intervalMs: number = WORKER_HEARTBEAT_INTERVAL_MS,
  ) {}

  /** Registers a source and beats immediately so the API sees it without waiting a full interval. */
  add(source: SourceKey): void {
    this.sources.add(source);
    void this.beat();
  }

  start(): void {
    if (this.timer) return;
    this.timer = setInterval(() => void this.beat(), this.intervalMs);
    this.timer.unref();
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  get sourceCount(): number {
    return this.sources.size;
  }

  async beat(): Promise<void> {
    await Promise.all(
      [...this.sources].map(async (source) => {
        try {
          await this.write(workerPresenceKey(source), WORKER_HEARTBEAT_TTL_SECONDS);
        } catch (err) {
          this.onError(err);
        }
      }),
    );
  }
}
