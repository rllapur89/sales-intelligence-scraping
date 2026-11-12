import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import {
  LEAD_EVENTS_CHANNEL,
  SUBSCRIPTIONS_CHANGED_CHANNEL,
  type LeadBatch,
  type LeadsRetracted,
  type LeadUpsertedEvent,
  type ResyncResponse,
  type SubscriptionFilter,
} from '@leads/shared';
import { PrismaService } from '../prisma/prisma.service';
import { REDIS_CONNECTION } from '../queue/queue.module';
import { TelemetryService } from '../telemetry/telemetry.service';
import { toSubscriptionFilter } from '../subscriptions/subscriptions.service';
import { BoundedIdSet, DEFAULT_HELD_LIMIT } from './bounded-id-set';
import { EventBatcher, type CoalescedWindow } from './coalescer';
import { SocketOutbox } from './outbox';
import { planDispatch } from './retraction-planner';
import { readPositiveInt, ResyncService } from './resync.service';

/** Minimal view of a connected socket, so the hub does not depend on socket.io types. */
export interface LiveClient {
  id: string;
  userId: string;
  emitBatch(batch: LeadBatch): void;
  emitRetracted(retraction: LeadsRetracted): void;
  isDrained(): boolean;
}

interface Session {
  client: LiveClient;
  filters: SubscriptionFilter[];
  outbox: SocketOutbox;
  /** Lead ids this socket was sent and that were not retracted since (bounded, see ADR 0005). */
  held: BoundedIdSet;
  ready: Promise<void>;
}

export function parseLeadEvent(raw: string): LeadUpsertedEvent | null {
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== 'object' || value === null) return null;
    const v = value as Partial<LeadUpsertedEvent>;
    if (v.type !== 'lead.upserted' || typeof v.seq !== 'number') return null;
    if (typeof v.lead !== 'object' || v.lead === null || typeof v.lead.id !== 'string') return null;
    if (typeof v.timings !== 'object' || v.timings === null) return null;
    return v as LeadUpsertedEvent;
  } catch {
    return null;
  }
}

/** Fans Redis lead events out to connected sockets, filtered per user subscription. */
@Injectable()
export class LiveHub implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(LiveHub.name);
  private readonly sessions = new Map<string, Session>();
  private subscriber: Redis | null = null;
  private batcher: EventBatcher | null = null;
  private readonly heldLimit: number;

  constructor(
    private readonly prisma: PrismaService,
    private readonly resyncService: ResyncService,
    private readonly config: ConfigService,
    private readonly telemetry: TelemetryService,
    @Inject(REDIS_CONNECTION) private readonly redis: Redis,
  ) {
    this.heldLimit = readPositiveInt(config.get<string>('GATEWAY_HELD_LIMIT'), DEFAULT_HELD_LIMIT);
  }

  async onModuleInit(): Promise<void> {
    const windowMs = readPositiveInt(this.config.get<string>('GATEWAY_BATCH_WINDOW_MS'), 200);
    this.batcher = new EventBatcher({ windowMs, onFlush: (w) => this.dispatch(w) });
    const subscriber = this.redis.duplicate();
    this.subscriber = subscriber;
    subscriber.on('message', (channel: string, message: string) => {
      if (channel === LEAD_EVENTS_CHANNEL) {
        const event = parseLeadEvent(message);
        if (event) {
          this.telemetry.countEvent();
          this.batcher?.add(event);
        } else {
          this.telemetry.countInvalidEvent();
        }
      } else if (channel === SUBSCRIPTIONS_CHANGED_CHANNEL) {
        void this.refreshUser(message);
      }
    });
    await subscriber.subscribe(LEAD_EVENTS_CHANNEL, SUBSCRIPTIONS_CHANGED_CHANNEL);
  }

  async onModuleDestroy(): Promise<void> {
    this.batcher?.stop();
    for (const session of this.sessions.values()) session.outbox.dispose();
    this.sessions.clear();
    this.subscriber?.disconnect();
  }

  get sessionCount(): number {
    return this.sessions.size;
  }

  register(client: LiveClient): void {
    const session: Session = {
      client,
      filters: [],
      outbox: new SocketOutbox({
        isDrained: () => client.isDrained(),
        emit: (batch) => client.emitBatch(batch),
        emitRetracted: (retraction) => client.emitRetracted(retraction),
      }),
      held: new BoundedIdSet(this.heldLimit),
      ready: Promise.resolve(),
    };
    session.ready = this.loadFilters(client.userId).then(
      (filters) => {
        session.filters = filters;
      },
      (err: unknown) => this.logger.warn(`Loading subscriptions failed: ${String(err)}`),
    );
    this.sessions.set(client.id, session);
    this.telemetry.setSockets(this.sessions.size);
  }

  unregister(clientId: string): void {
    this.sessions.get(clientId)?.outbox.dispose();
    this.sessions.delete(clientId);
    this.telemetry.setSockets(this.sessions.size);
  }

  async resync(clientId: string, lastSeq: number): Promise<ResyncResponse> {
    const session = this.sessions.get(clientId);
    if (!session) return { mode: 'full', reason: 'unknown-seq', currentSeq: 0 };
    await session.ready;
    const response = await this.resyncService.resync(lastSeq, session.filters);
    this.applyResyncToHeld(session, response);
    return response;
  }

  /**
   * A full resync makes the client reload its snapshot, so nothing it held before is known any
   * more. A delta resync keeps what the client already has and adds what it now delivers.
   */
  private applyResyncToHeld(session: Session, response: ResyncResponse): void {
    if (response.mode === 'full') {
      session.held.clear();
      return;
    }
    for (const batch of response.batches) {
      for (const lead of batch.leads) session.held.add(lead.id);
    }
  }

  /** Reloads the subscriptions of every live socket of this user (this instance only). */
  async refreshUser(userId: string): Promise<void> {
    const mine = [...this.sessions.values()].filter((s) => s.client.userId === userId);
    if (mine.length === 0) return;
    try {
      const filters = await this.loadFilters(userId);
      for (const session of mine) session.filters = filters;
    } catch (err) {
      this.logger.warn(`Refreshing subscriptions failed: ${String(err)}`);
    }
  }

  private async loadFilters(userId: string): Promise<SubscriptionFilter[]> {
    const rows = await this.prisma.subscription.findMany({ where: { userId, active: true } });
    return rows.map(toSubscriptionFilter);
  }

  private dispatch(window: CoalescedWindow): void {
    const all = [...window.entries.values()];
    for (const session of this.sessions.values()) {
      const plan = planDispatch(session.held, all, session.filters);
      for (const entry of plan.retractions) session.held.delete(entry.lead.id);
      for (const entry of plan.deliveries) session.held.add(entry.lead.id);
      if (plan.retractions.length > 0) {
        session.outbox.offerRetractions(
          plan.retractions.map((e) => e.lead.id),
          window.toSeq,
        );
      }
      if (plan.deliveries.length > 0) {
        this.telemetry.observeBatch(plan.deliveries.length);
        session.outbox.offer(plan.deliveries, window.fromSeq, window.toSeq);
      }
    }
  }
}
