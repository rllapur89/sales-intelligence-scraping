import { Prisma, type PrismaClient, type SourceKey as DbSourceKey } from '@leads/db';
import { toDbSourceKey, type SourceKey } from '@leads/shared';

export type StoredJobStatus = 'QUEUED' | 'RUNNING' | 'COMPLETED' | 'FAILED' | 'CANCELLED';

/** Persistence port for ScrapingJob tracking, so the task handler is testable without a database. */
export interface ScrapeJobStore {
  getStatus(id: string): Promise<StoredJobStatus | null>;
  /** QUEUED -> RUNNING with the number of per-target tasks planned. */
  markRunning(id: string, tasksTotal: number): Promise<void>;
  fail(id: string, message: string): Promise<void>;
  /**
   * Atomically counts one finished task. Returns true when it was the last one (the job is then
   * finalized: COMPLETED, or FAILED when every task failed).
   */
  recordTask(id: string, result: { itemsFound: number; error?: string }): Promise<boolean>;
  /** Source health bookkeeping. */
  recordSourceOutcome(
    source: SourceKey,
    outcome: { ok: true } | { ok: false; error: string },
  ): Promise<void>;
}

const MAX_STORED_ERRORS = 20;

export class PrismaScrapeJobStore implements ScrapeJobStore {
  constructor(private readonly prisma: PrismaClient) {}

  async getStatus(id: string): Promise<StoredJobStatus | null> {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
      select: { status: true },
    });
    return job?.status ?? null;
  }

  async markRunning(id: string, tasksTotal: number): Promise<void> {
    await this.prisma.scrapingJob.updateMany({
      where: { id, status: 'QUEUED' },
      data: { status: 'RUNNING', startedAt: new Date(), tasksTotal, progress: 0 },
    });
  }

  async fail(id: string, message: string): Promise<void> {
    const now = new Date();
    await this.prisma.$executeRaw`
      UPDATE "ScrapingJob"
      SET "status" = 'FAILED', "completedAt" = ${now}, "errorCount" = "errorCount" + 1,
          "errors" = "errors" || to_jsonb(${message}::text),
          "startedAt" = COALESCE("startedAt", ${now}), "durationMs" = 0
      WHERE "id" = ${id} AND "status" IN ('QUEUED', 'RUNNING')`;
  }

  async recordTask(id: string, result: { itemsFound: number; error?: string }): Promise<boolean> {
    const error = result.error ?? null;
    const failed = error ? 1 : 0;
    // One statement: counters, capped error list and progress move together, so concurrent
    // tasks of the same job never lose updates.
    const rows = await this.prisma.$queryRaw<
      { tasksDone: number; tasksTotal: number; errorCount: number; startedAt: Date | null }[]
    >(Prisma.sql`
      UPDATE "ScrapingJob" SET
        "tasksDone" = "tasksDone" + 1,
        "itemsFound" = "itemsFound" + ${result.itemsFound},
        "errorCount" = "errorCount" + ${failed},
        "errors" = CASE
          WHEN ${error}::text IS NULL OR jsonb_array_length("errors") >= ${MAX_STORED_ERRORS} THEN "errors"
          ELSE "errors" || to_jsonb(${error}::text) END,
        "progress" = CASE WHEN "tasksTotal" > 0
          THEN LEAST(100, (("tasksDone" + 1) * 100) / "tasksTotal") ELSE 100 END
      WHERE "id" = ${id} AND "status" = 'RUNNING'
      RETURNING "tasksDone", "tasksTotal", "errorCount", "startedAt"`);
    const row = rows[0];
    if (!row || row.tasksDone < row.tasksTotal) return false;

    const now = new Date();
    const status = row.errorCount >= row.tasksTotal ? 'FAILED' : 'COMPLETED';
    const finalized = await this.prisma.scrapingJob.updateMany({
      where: { id, status: 'RUNNING' },
      data: {
        status,
        progress: 100,
        completedAt: now,
        durationMs: row.startedAt ? now.getTime() - row.startedAt.getTime() : null,
      },
    });
    return finalized.count === 1;
  }

  async recordSourceOutcome(
    source: SourceKey,
    outcome: { ok: true } | { ok: false; error: string },
  ): Promise<void> {
    const key = toDbSourceKey(source) as DbSourceKey;
    const now = new Date();
    if (outcome.ok) {
      await this.prisma.source.updateMany({
        where: { key },
        data: { health: 'HEALTHY', consecutiveFailures: 0, lastSuccessAt: now },
      });
      return;
    }
    const row = await this.prisma.source.update({
      where: { key },
      data: {
        consecutiveFailures: { increment: 1 },
        lastErrorAt: now,
        lastError: outcome.error.slice(0, 500),
      },
      select: { id: true, consecutiveFailures: true },
    });
    await this.prisma.source.update({
      where: { id: row.id },
      data: { health: row.consecutiveFailures >= 5 ? 'DOWN' : 'DEGRADED' },
    });
  }
}
