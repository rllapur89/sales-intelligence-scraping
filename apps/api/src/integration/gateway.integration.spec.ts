/**
 * Real Postgres + Redis integration spec. Skipped unless INTEGRATION_TESTS=1.
 * Requires DATABASE_URL pointing at a dedicated schema named `integration`, and a prior
 * `nest build` (the spec boots the compiled app because Nest DI needs decorator metadata,
 * which vitest/esbuild does not emit).
 *
 *   INTEGRATION_TESTS=1 DATABASE_URL=postgresql://leads:leads@localhost:5432/leads?schema=integration \
 *   REDIS_URL=redis://localhost:6379 npx vitest run src/integration
 */
import { resolve } from 'node:path';
import { hashSync } from 'bcryptjs';
import { Redis } from 'ioredis';
import { io, type Socket } from 'socket.io-client';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { PrismaClient } from '@leads/db';
import {
  LEAD_EVENTS_CHANNEL,
  type AuthResponse,
  type ClientToServerEvents,
  type LeadBatch,
  type LeadDto,
  type LeadUpsertedEvent,
  type ResyncResponse,
  type ServerToClientEvents,
  type SubscriptionDto,
} from '@leads/shared';

const enabled = process.env['INTEGRATION_TESTS'] === '1';
const PASSWORD = 'integration-pass';
const SALES = 'sales@demo.local';
const ADMIN = 'admin@demo.local';

type ClientSocket = Socket<ServerToClientEvents, ClientToServerEvents>;

interface NestAppLike {
  setGlobalPrefix(prefix: string): void;
  set(key: string, value: string): void;
  useGlobalPipes(pipe: unknown): void;
  useWebSocketAdapter(adapter: unknown): void;
  listen(port: number): Promise<unknown>;
  getUrl(): Promise<string>;
  close(): Promise<void>;
}

const sleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function makeLead(id: string, seq: number, over: Partial<LeadDto> = {}): LeadDto {
  return {
    id,
    company: {
      id: `c-${id}`,
      domain: `${id}.integration.test`,
      name: `Integration ${id}`,
      industry: 'SaaS',
      region: 'US',
      size: null,
      description: null,
      techHints: [],
    },
    score: 70,
    stage: 'new',
    signalTypes: ['hiring'],
    signalCount: 1,
    seq,
    updatedAt: new Date().toISOString(),
    ...over,
  };
}

describe.skipIf(!enabled)('realtime gateway (integration)', () => {
  let app: NestAppLike;
  let baseUrl: string;
  let prisma: PrismaClient;
  let publisher: Redis;
  const sockets: ClientSocket[] = [];
  let baseSeq = 0;
  let leadId = '';
  let companyId = '';

  async function login(email: string): Promise<AuthResponse> {
    const res = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email, password: PASSWORD }),
    });
    expect(res.status).toBe(200);
    return (await res.json()) as AuthResponse;
  }

  function connect(token: string): Promise<ClientSocket> {
    const socket: ClientSocket = io(baseUrl, {
      auth: { token },
      transports: ['websocket'],
      reconnection: false,
    });
    sockets.push(socket);
    return new Promise((resolveSocket, reject) => {
      socket.once('connect', () => resolveSocket(socket));
      socket.once('connect_error', reject);
    });
  }

  function collect(socket: ClientSocket): LeadBatch[] {
    const batches: LeadBatch[] = [];
    socket.on('leads:batch', (b) => batches.push(b));
    return batches;
  }

  async function waitFor(predicate: () => boolean, timeoutMs: number): Promise<boolean> {
    const start = Date.now();
    while (Date.now() - start < timeoutMs) {
      if (predicate()) return true;
      await sleep(20);
    }
    return predicate();
  }

  function publish(seq: number, lead: LeadDto): Promise<number> {
    const event: LeadUpsertedEvent = {
      type: 'lead.upserted',
      seq,
      source: 'greenhouse',
      lead,
      timings: { scrapedAt: Date.now() - 50, ingestedAt: Date.now() - 20 },
    };
    return publisher.publish(LEAD_EVENTS_CHANNEL, JSON.stringify(event));
  }

  function resync(socket: ClientSocket, lastSeq: number): Promise<ResyncResponse> {
    return socket.timeout(2000).emitWithAck('leads:resync', { lastSeq });
  }

  beforeAll(async () => {
    const dbUrl = process.env['DATABASE_URL'] ?? '';
    if (!dbUrl.includes('schema=integration')) {
      throw new Error('Integration spec requires DATABASE_URL with schema=integration');
    }
    Object.assign(process.env, {
      JWT_ACCESS_SECRET: 'integration-access-secret',
      JWT_REFRESH_SECRET: 'integration-refresh-secret',
      GATEWAY_BATCH_WINDOW_MS: '50',
      GATEWAY_REPLAY_MAX_GAP: '3',
      REDIS_URL: process.env['REDIS_URL'] ?? 'redis://localhost:6379',
    });

    prisma = new PrismaClient();
    for (const [email, displayName, role] of [
      [ADMIN, 'Demo Admin', 'ADMIN'],
      [SALES, 'Demo Sales', 'USER'],
    ] as const) {
      const user = await prisma.user.upsert({
        where: { email },
        update: { passwordHash: hashSync(PASSWORD, 4), refreshTokenHash: null },
        create: { email, displayName, role, passwordHash: hashSync(PASSWORD, 4) },
      });
      await prisma.subscription.deleteMany({ where: { userId: user.id } });
      await prisma.subscription.create({ data: { userId: user.id, name: 'All leads' } });
    }

    // Replay fixtures: one lead with 5 events.
    const company = await prisma.company.upsert({
      where: { domain: 'replay.integration.test' },
      update: {},
      create: { domain: 'replay.integration.test', name: 'Replay', industry: 'SaaS', region: 'US' },
    });
    companyId = company.id;
    const lead = await prisma.lead.upsert({
      where: { companyId },
      update: {},
      create: { companyId, score: 70, industry: 'SaaS', region: 'US', signalTypes: ['HIRING'] },
    });
    leadId = lead.id;
    await prisma.leadEvent.deleteMany({ where: { leadId } });
    for (let i = 0; i < 5; i++) {
      const row = await prisma.leadEvent.create({
        data: {
          leadId,
          payload: {},
          source: 'GREENHOUSE',
          scrapedAt: new Date(),
          ingestedAt: new Date(),
        },
      });
      await prisma.leadEvent.update({
        where: { seq: row.seq },
        data: { payload: makeLead(leadId, Number(row.seq), { score: 60 + i }) as never },
      });
    }
    const max = await prisma.leadEvent.aggregate({ _max: { seq: true } });
    baseSeq = Number(max._max.seq ?? 0);

    const distDir = resolve(__dirname, '../../dist');
    const dynamicImport = (file: string): Promise<Record<string, unknown>> =>
      import(/* @vite-ignore */ resolve(distDir, file)) as Promise<Record<string, unknown>>;
    const nestCore = (await import('@nestjs/core')) as unknown as {
      NestFactory: { create(module: unknown): Promise<NestAppLike> };
    };
    const common = (await import('@nestjs/common')) as unknown as {
      ValidationPipe: new (opts: object) => unknown;
    };
    const appModule = (await dynamicImport('app.module.js'))['AppModule'];
    const adapterModule = (await dynamicImport('realtime/redis-io.adapter.js'))[
      'RedisIoAdapter'
    ] as new (app: unknown, redisUrl: string, cors: string) => { connect(): void };

    app = await nestCore.NestFactory.create(appModule);
    app.set('query parser', 'extended');
    app.setGlobalPrefix('api');
    app.useGlobalPipes(
      new common.ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }),
    );
    const adapter = new adapterModule(app, process.env['REDIS_URL'] as string, '*');
    adapter.connect();
    app.useWebSocketAdapter(adapter);
    await app.listen(0);
    baseUrl = (await app.getUrl()).replace('[::1]', 'localhost');
    publisher = new Redis(process.env['REDIS_URL'] as string);
  }, 60_000);

  afterAll(async () => {
    for (const s of sockets) s.disconnect();
    await publisher?.quit();
    if (prisma) {
      await prisma.leadEvent.deleteMany({ where: { leadId } });
      await prisma.company.deleteMany({ where: { id: companyId } });
      await prisma.$disconnect();
    }
    await app?.close();
  }, 30_000);

  it('protects REST routes, keeps health/login public and rotates refresh tokens', async () => {
    expect((await fetch(`${baseUrl}/api/leads`)).status).toBe(401);
    expect((await fetch(`${baseUrl}/api/health`)).status).toBe(200);

    const bad = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: SALES, password: 'wrong' }),
    });
    expect(bad.status).toBe(401);

    const session = await login(SALES);
    const me = await fetch(`${baseUrl}/api/auth/me`, {
      headers: { authorization: `Bearer ${session.accessToken}` },
    });
    expect(me.status).toBe(200);

    const refreshed = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(refreshed.status).toBe(200);
    const replay = await fetch(`${baseUrl}/api/auth/refresh`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ refreshToken: session.refreshToken }),
    });
    expect(replay.status).toBe(401);
  });

  it('rejects an invalid token at handshake with an "unauthorized" error', async () => {
    await expect(connect('garbage')).rejects.toMatchObject({ message: 'unauthorized' });
  });

  it('delivers a batch with publishedAt within ~1s to a matching subscription', async () => {
    const { accessToken } = await login(SALES);
    const socket = await connect(accessToken);
    const batches = collect(socket);
    await sleep(150); // let the hub load this socket's subscriptions
    const seq = baseSeq + 1000;
    await publish(seq, makeLead('live-1', seq));
    expect(await waitFor(() => batches.length > 0, 1000)).toBe(true);
    const batch = batches[0] as LeadBatch;
    expect(batch.leads.map((l) => l.id)).toEqual(['live-1']);
    expect(batch.toSeq).toBe(seq);
    expect(batch.timings['live-1']?.publishedAt).toBeTypeOf('number');
  });

  it('sends nothing to a non-matching subscription, also after a live subscription change', async () => {
    const sales = await login(SALES);
    const admin = await login(ADMIN);
    const adminSocket = await connect(admin.accessToken);
    const salesSocket = await connect(sales.accessToken);
    const adminBatches = collect(adminSocket);
    const salesBatches = collect(salesSocket);
    await sleep(150);

    const list = await fetch(`${baseUrl}/api/subscriptions`, {
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    const [sub] = (await list.json()) as SubscriptionDto[];
    const patched = await fetch(`${baseUrl}/api/subscriptions/${sub?.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.accessToken}` },
      body: JSON.stringify({ industries: ['Nonexistent'], minScore: 100 }),
    });
    expect(patched.status).toBe(200);
    await sleep(200); // subscription refresh travels through Redis pub/sub

    const seq = baseSeq + 2000;
    await publish(seq, makeLead('live-2', seq));
    expect(await waitFor(() => salesBatches.length > 0, 1000)).toBe(true);
    await sleep(300);
    expect(adminBatches).toHaveLength(0);

    // A user without any active subscription receives nothing either.
    await fetch(`${baseUrl}/api/subscriptions/${sub?.id}`, {
      method: 'PATCH',
      headers: { 'content-type': 'application/json', authorization: `Bearer ${admin.accessToken}` },
      body: JSON.stringify({ active: false, industries: [], minScore: 0 }),
    });
    await sleep(200);
    await publish(seq + 1, makeLead('live-3', seq + 1));
    await sleep(400);
    expect(adminBatches).toHaveLength(0);
  });

  it('other users cannot touch a subscription they do not own (404)', async () => {
    const sales = await login(SALES);
    const admin = await login(ADMIN);
    const list = await fetch(`${baseUrl}/api/subscriptions`, {
      headers: { authorization: `Bearer ${admin.accessToken}` },
    });
    const [sub] = (await list.json()) as SubscriptionDto[];
    const res = await fetch(`${baseUrl}/api/subscriptions/${sub?.id}`, {
      method: 'DELETE',
      headers: { authorization: `Bearer ${sales.accessToken}` },
    });
    expect(res.status).toBe(404);
  });

  it('resync answers delta within the gap and full otherwise', async () => {
    const { accessToken } = await login(SALES);
    const socket = await connect(accessToken);
    await sleep(150);

    const delta = await resync(socket, baseSeq - 1);
    expect(delta.mode).toBe('delta');
    if (delta.mode === 'delta') {
      expect(delta.currentSeq).toBe(baseSeq);
      // The overlap window may include other leads; ours must appear once, latest payload.
      const mine = delta.batches.flatMap((b) => b.leads).filter((l) => l.id === leadId);
      expect(mine).toHaveLength(1);
      expect(mine[0]?.seq).toBe(baseSeq);
      expect(mine[0]?.score).toBe(64);
    }

    expect(await resync(socket, 0)).toEqual({
      mode: 'full',
      reason: 'unknown-seq',
      currentSeq: baseSeq,
    });
    expect(await resync(socket, baseSeq + 50)).toMatchObject({
      mode: 'full',
      reason: 'unknown-seq',
    });
    expect(await resync(socket, baseSeq - 4)).toEqual({
      mode: 'full',
      reason: 'gap-too-large',
      currentSeq: baseSeq,
    });
  });
});
