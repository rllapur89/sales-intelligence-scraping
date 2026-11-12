import { writeFileSync } from 'node:fs';
import { hashSync } from 'bcryptjs';
import { Redis } from 'ioredis';
import { io } from 'socket.io-client';
import { PrismaClient } from '@leads/db';
import { readConfig } from './config';
import { buildProfiles } from './profiles';
import { runPublisher } from './publisher';
import { cleanupUsers, provisionUsers, type UserStore } from './provision';
import { LatencyRecorder } from './recorder';
import { renderReport } from './report';
import { createRng } from './rng';
import { Swarm, type SwarmSocket } from './swarm';
import { SyntheticLeads } from './synthetic';

function prismaStore(prisma: PrismaClient): UserStore {
  return {
    async ensureUsers(emails, password) {
      const passwordHash = hashSync(password, 4); // low cost on purpose: only the login is timed
      await prisma.user.createMany({
        data: emails.map((email) => ({ email, passwordHash, displayName: 'Load test' })),
        skipDuplicates: true,
      });
    },
    async deleteByEmailPrefix(prefix) {
      const res = await prisma.user.deleteMany({ where: { email: { startsWith: prefix } } });
      return res.count;
    },
  };
}

async function main(): Promise<void> {
  const config = readConfig(process.env);
  const rng = createRng(config.seed);
  const prisma = new PrismaClient();
  const redis = new Redis(config.redisUrl);
  const store = prismaStore(prisma);
  const recorder = new LatencyRecorder(rng);
  let swarm: Swarm | null = null;

  try {
    console.log(`Provisioning ${config.users} users against ${config.apiUrl} ...`);
    const users = await provisionUsers(
      { apiUrl: config.apiUrl, store },
      buildProfiles(config.users, rng),
    );

    swarm = new Swarm(
      (token): SwarmSocket =>
        io(config.apiUrl, {
          auth: { token },
          transports: ['websocket'],
          reconnection: false,
          forceNew: true,
        }),
      recorder,
      {
        rampBatchSize: config.rampBatchSize,
        rampDelayMs: config.rampDelayMs,
        ackEveryNth: config.ackEveryNth,
      },
    );
    console.log(`Opening ${config.clients} clients ...`);
    await swarm.start(users, config.clients);
    const connected = await swarm.waitConnected(config.clients, 30_000);
    console.log(`${connected}/${config.clients} clients connected`);
    if (connected === 0) throw new Error('No client could connect; is the API running?');

    console.log(
      `Publishing ${config.eventsPerSecond} events/s for ${config.durationSeconds} s ...`,
    );
    const startedAt = new Date().toISOString();
    const generator = new SyntheticLeads(rng);
    const result = await runPublisher(
      () => generator.next(),
      (channel, message) => redis.publish(channel, message),
      { ratePerSecond: config.eventsPerSecond, durationMs: config.durationSeconds * 1000 },
    );
    // Let the last batches (200 ms window plus network) arrive before measuring.
    await new Promise((r) => setTimeout(r, 2000));

    const report = renderReport(
      config,
      {
        startedAt,
        connected,
        eventsPublished: result.published,
        publishSeconds: result.elapsedMs / 1000,
        achievedRate: result.achievedRate,
        node: process.version,
        platform: `${process.platform} ${process.arch}`,
      },
      recorder.snapshot(),
    );
    console.log(`\n${report}`);
    if (config.reportPath) {
      writeFileSync(config.reportPath, report);
      console.log(`Report written to ${config.reportPath}`);
    }
  } finally {
    swarm?.stop();
    const removed = await cleanupUsers(store).catch(() => 0);
    console.log(`Removed ${removed} load test users`);
    redis.disconnect();
    await prisma.$disconnect();
  }
}

main().catch((err: unknown) => {
  console.error(err);
  process.exitCode = 1;
});
