import { describe, expect, it, vi } from 'vitest';
import type { LeadBatch, LeadDto } from '@leads/shared';
import type { ProvisionedUser } from './provision';
import { LatencyRecorder } from './recorder';
import { Swarm, type SwarmSocket } from './swarm';

class FakeSocket implements SwarmSocket {
  readonly emitted: Array<{ event: string; payload: unknown }> = [];
  disconnected = false;
  private readonly listeners = new Map<string, Array<(...args: never[]) => void>>();

  on(event: string, listener: (...args: never[]) => void): this {
    this.listeners.set(event, [...(this.listeners.get(event) ?? []), listener]);
    return this;
  }
  emit(event: string, payload: unknown): void {
    this.emitted.push({ event, payload });
  }
  disconnect(): void {
    this.disconnected = true;
    this.fire('disconnect');
  }
  fire(event: string, ...args: unknown[]): void {
    for (const l of this.listeners.get(event) ?? []) l(...args);
  }
}

const user = (token: string): ProvisionedUser => ({
  email: `${token}@x.invalid`,
  token,
  filter: { industries: [], regions: [], signalTypes: [], minScore: 0 },
});

function batchOf(n: number): LeadBatch {
  const leads = Array.from({ length: n }, (_, i) => ({ id: `l${i}`, seq: i + 1 }) as LeadDto);
  return {
    fromSeq: 1,
    toSeq: n,
    leads,
    timings: Object.fromEntries(
      leads.map((l) => [l.id, { scrapedAt: 0, ingestedAt: 10, publishedAt: 20 }]),
    ),
  };
}

function setup(ackEveryNth = 2) {
  const sockets: FakeSocket[] = [];
  const tokens: string[] = [];
  const recorder = new LatencyRecorder();
  const sleeps: number[] = [];
  const swarm = new Swarm(
    (token) => {
      const s = new FakeSocket();
      sockets.push(s);
      tokens.push(token);
      return s;
    },
    recorder,
    {
      rampBatchSize: 2,
      rampDelayMs: 50,
      ackEveryNth,
      now: () => 100,
      sleep: (ms) => {
        sleeps.push(ms);
        return Promise.resolve();
      },
    },
  );
  return { swarm, sockets, tokens, recorder, sleeps };
}

describe('Swarm', () => {
  it('opens the requested clients spread over the users, in ramp waves', async () => {
    const s = setup();
    await s.swarm.start([user('a'), user('b')], 5);
    expect(s.sockets).toHaveLength(5);
    expect(s.tokens.filter((t) => t === 'a')).toHaveLength(3);
    expect(s.tokens.filter((t) => t === 'b')).toHaveLength(2);
    // 5 clients in waves of 2: pauses after wave 1 and 2, none after the last.
    expect(s.sleeps).toEqual([50, 50]);
  });

  it('tracks connected clients and counts unexpected disconnects only', async () => {
    const s = setup();
    await s.swarm.start([user('a')], 2);
    s.sockets.forEach((sock) => sock.fire('connect'));
    expect(s.swarm.connectedCount).toBe(2);
    s.sockets[0]?.fire('disconnect');
    expect(s.recorder.snapshot().disconnects).toBe(1);
    s.swarm.stop();
    expect(s.recorder.snapshot().disconnects).toBe(1);
    expect(s.sockets.every((x) => x.disconnected)).toBe(true);
  });

  it('records connect errors', async () => {
    const s = setup();
    await s.swarm.start([user('a')], 1);
    s.sockets[0]?.fire('connect_error', new Error('unauthorized'));
    expect(s.recorder.snapshot().connectErrors).toBe(1);
  });

  it('records each batch and acks one in N delivered leads', async () => {
    const s = setup(2);
    await s.swarm.start([user('a')], 1);
    s.sockets[0]?.fire('leads:batch', batchOf(5));
    expect(s.recorder.snapshot().leadsDelivered).toBe(5);
    const acks = s.sockets[0]?.emitted.filter((e) => e.event === 'latency:ack') ?? [];
    expect(acks).toHaveLength(1);
    const payload = acks[0]?.payload as Array<{ leadId: string; renderedAt: number }>;
    expect(payload.map((a) => a.leadId)).toEqual(['l1', 'l3']);
    expect(payload[0]?.renderedAt).toBe(100);
  });

  it('sends no ack event when no lead is sampled', async () => {
    const s = setup(10);
    await s.swarm.start([user('a')], 1);
    s.sockets[0]?.fire('leads:batch', batchOf(3));
    expect(s.sockets[0]?.emitted).toEqual([]);
  });

  it('waitConnected returns immediately when enough clients are connected', async () => {
    const s = setup();
    await s.swarm.start([user('a')], 1);
    s.sockets[0]?.fire('connect');
    const sleepSpy = vi.fn();
    expect(await s.swarm.waitConnected(1, 1000)).toBe(1);
    expect(sleepSpy).not.toHaveBeenCalled();
  });
});
