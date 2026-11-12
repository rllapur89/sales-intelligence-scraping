import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ConfigService } from '@nestjs/config';
import type { Redis } from 'ioredis';
import {
  LEAD_EVENTS_CHANNEL,
  type LeadBatch,
  type LeadsRetracted,
  type ResyncResponse,
} from '@leads/shared';
import type { PrismaService } from '../prisma/prisma.service';
import type { TelemetryService } from '../telemetry/telemetry.service';
import { makeEvent, makeLead } from './fixtures';
import { LiveHub, type LiveClient } from './live-hub';
import type { ResyncService } from './resync.service';

type Listener = (channel: string, message: string) => void;

class FakeSubscriber {
  listener: Listener | null = null;
  on(_event: string, cb: Listener): void {
    this.listener = cb;
  }
  subscribe(): Promise<void> {
    return Promise.resolve();
  }
  disconnect(): void {}
}

function subscriptionRow(minScore: number, industries: string[] = []) {
  return {
    id: 's',
    userId: 'u1',
    name: 'n',
    active: true,
    industries,
    regions: [],
    signalTypes: [],
    minScore,
    notify: false,
  };
}

describe('LiveHub retraction', () => {
  const subscriber = new FakeSubscriber();
  const findMany = vi.fn();
  const resyncImpl = vi.fn();
  let hub: LiveHub;
  let batches: LeadBatch[];
  let retractions: LeadsRetracted[];
  let drained: boolean;

  const client: LiveClient = {
    id: 'sock-1',
    userId: 'u1',
    emitBatch: (b) => batches.push(b),
    emitRetracted: (r) => retractions.push(r),
    isDrained: () => drained,
  };

  const publish = (seq: number, id: string, over: Parameters<typeof makeLead>[1] = {}) =>
    subscriber.listener?.(LEAD_EVENTS_CHANNEL, JSON.stringify(makeEvent(seq, makeLead(id, over))));
  const window = () => vi.advanceTimersByTimeAsync(60);

  async function connect(rows = [subscriptionRow(50)]): Promise<void> {
    findMany.mockResolvedValue(rows);
    hub.register(client);
    await vi.advanceTimersByTimeAsync(0);
  }

  beforeEach(async () => {
    vi.useFakeTimers();
    batches = [];
    retractions = [];
    drained = true;
    findMany.mockReset();
    resyncImpl.mockReset();
    const redis = { duplicate: () => subscriber } as unknown as Redis;
    const config = {
      get: (key: string) => (key === 'GATEWAY_BATCH_WINDOW_MS' ? '50' : undefined),
    } as unknown as ConfigService;
    hub = new LiveHub(
      { subscription: { findMany } } as unknown as PrismaService,
      { resync: resyncImpl } as unknown as ResyncService,
      config,
      {
        countEvent: vi.fn(),
        countInvalidEvent: vi.fn(),
        observeBatch: vi.fn(),
        setSockets: vi.fn(),
      } as unknown as TelemetryService,
      redis,
    );
    await hub.onModuleInit();
  });

  afterEach(async () => {
    await hub.onModuleDestroy();
    vi.useRealTimers();
  });

  it('delivers a matching lead and sends no retraction', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    expect(batches.map((b) => b.leads.map((l) => l.id))).toEqual([['a']]);
    expect(retractions).toEqual([]);
  });

  it('retracts a delivered lead whose score drops below the minimum', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    publish(2, 'a', { score: 10 });
    await window();
    expect(batches).toHaveLength(1);
    expect(retractions).toEqual([{ leadIds: ['a'], seq: 2 }]);
  });

  it('retracts when the industry changes away from the subscription', async () => {
    await connect([subscriptionRow(0, ['SaaS'])]);
    publish(1, 'a', { industry: 'SaaS' });
    await window();
    publish(2, 'a', { industry: 'Retail' });
    await window();
    expect(retractions).toEqual([{ leadIds: ['a'], seq: 2 }]);
  });

  it('sends nothing for a lead that never matched', async () => {
    await connect();
    publish(1, 'a', { score: 10 });
    await window();
    expect(batches).toEqual([]);
    expect(retractions).toEqual([]);
  });

  it('retracts only once: the lead is no longer held after the retraction', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    publish(2, 'a', { score: 10 });
    await window();
    publish(3, 'a', { score: 5 });
    await window();
    expect(retractions).toHaveLength(1);
  });

  it('delivers again after a retraction when the lead matches again', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    publish(2, 'a', { score: 10 });
    await window();
    publish(3, 'a', { score: 90 });
    await window();
    expect(batches.map((b) => b.leads[0]?.score)).toEqual([80, 90]);
    publish(4, 'a', { score: 1 });
    await window();
    expect(retractions).toHaveLength(2);
  });

  it('a congested socket gets one retraction for a lead and none when it comes back', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    publish(2, 'b', { score: 80 });
    await window();
    drained = false;
    publish(3, 'a', { score: 10 });
    publish(4, 'b', { score: 10 });
    await window();
    publish(5, 'b', { score: 95 });
    await window();
    expect(retractions).toEqual([]);
    drained = true;
    await vi.advanceTimersByTimeAsync(40);
    expect(retractions).toEqual([{ leadIds: ['a'], seq: 4 }]);
    expect(batches.at(-1)?.leads.map((l) => [l.id, l.score])).toEqual([['b', 95]]);
  });

  it('a full resync clears the held set so nothing is retracted afterwards', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    resyncImpl.mockResolvedValue({
      mode: 'full',
      reason: 'gap-too-large',
      currentSeq: 9,
    } satisfies ResyncResponse);
    await hub.resync('sock-1', 1);
    publish(10, 'a', { score: 10 });
    await window();
    expect(retractions).toEqual([]);
  });

  it('a delta resync keeps held ids and adds the ones it delivers', async () => {
    await connect();
    publish(1, 'a', { score: 80 });
    await window();
    const replayed = makeLead('b', { score: 90, seq: 5 });
    resyncImpl.mockResolvedValue({
      mode: 'delta',
      currentSeq: 5,
      batches: [{ fromSeq: 5, toSeq: 5, leads: [replayed], timings: {} }],
    } satisfies ResyncResponse);
    await hub.resync('sock-1', 1);
    publish(6, 'a', { score: 10 });
    publish(7, 'b', { score: 10 });
    await window();
    expect(retractions).toHaveLength(1);
    expect([...(retractions[0]?.leadIds ?? [])].sort()).toEqual(['a', 'b']);
  });

  it('stops tracking a socket on unregister', async () => {
    await connect();
    hub.unregister('sock-1');
    publish(1, 'a', { score: 80 });
    await window();
    expect(batches).toEqual([]);
    expect(hub.sessionCount).toBe(0);
  });
});
