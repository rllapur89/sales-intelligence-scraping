/** Needs Redis (REDIS_URL). Skipped unless INTEGRATION_TESTS=1. Kept apart from the Postgres spec: loading Prisma and BullMQ in one vitest worker crashed it on Windows. */
import { describe, expect, it } from 'vitest';
import { Queue, QueueEvents, Worker } from 'bullmq';
import { Redis } from 'ioredis';

const describeIf = process.env['INTEGRATION_TESTS'] === '1' ? describe : describe.skip;

describeIf('BullMQ limiter (Redis)', () => {
  it('processes no more than `max` jobs per duration', async () => {
    const connection = new Redis(process.env['REDIS_URL'] ?? 'redis://localhost:6379', {
      maxRetriesPerRequest: null,
    });
    const name = `itest-limiter-${Date.now()}`;
    const queue = new Queue(name, { connection });
    const startedAt: number[] = [];
    const worker = new Worker(
      name,
      async () => {
        startedAt.push(Date.now());
      },
      { connection, concurrency: 5, limiter: { max: 2, duration: 1000 } },
    );
    const queueEvents = new QueueEvents(name, { connection });
    await queueEvents.waitUntilReady();
    const jobs = await Promise.all(Array.from({ length: 6 }, (_, i) => queue.add('t', { i })));
    await Promise.all(jobs.map((j) => j.waitUntilFinished(queueEvents)));

    // 6 jobs at 2/second need at least 2 full windows after the first batch.
    expect(Math.max(...startedAt) - Math.min(...startedAt)).toBeGreaterThanOrEqual(1900);
    const perWindow = startedAt.filter((t) => t < Math.min(...startedAt) + 1000).length;
    expect(perWindow).toBeLessThanOrEqual(2);

    await worker.close();
    await queueEvents.close();
    await queue.obliterate({ force: true });
    await queue.close();
    connection.disconnect();
  }, 20_000);
});
