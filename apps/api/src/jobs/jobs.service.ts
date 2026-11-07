import { Inject, Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Prisma } from '@leads/db';
import {
  SOURCE_POLICIES,
  fromDbSourceKey,
  toDbSourceKey,
  type Page,
  type ScrapingJobDto,
  type SourceKey,
} from '@leads/shared';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { fromDbJobStatus, toJobDto } from '../common/mappers';
import { sliceKeysetPage } from '../leads/lead-query';
import { PrismaService } from '../prisma/prisma.service';
import { SCRAPE_QUEUES, type ScrapeQueues } from '../queue/queue.module';
import {
  assertCancellable,
  assertRetryable,
  assertSourceReviewed,
  buildPlanJobOptions,
  buildPlanTaskData,
  slugsFromParams,
} from './job-rules';
import type { CreateJobDto, ListJobsQueryDto } from './jobs.dto';

type DbSourceKey = Prisma.SourceCreateInput['key'];

@Injectable()
export class JobsService {
  private readonly logger = new Logger(JobsService.name);

  constructor(
    private readonly prisma: PrismaService,
    @Inject(SCRAPE_QUEUES) private readonly queues: ScrapeQueues,
  ) {}

  async list(query: ListJobsQueryDto): Promise<Page<ScrapingJobDto>> {
    let where: Prisma.ScrapingJobWhereInput = {};
    if (query.cursor) {
      const pos = decodeCursor(query.cursor, 'created');
      const at = new Date(pos.value as string);
      where = { OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: pos.id } }] };
    }
    const rows = await this.prisma.scrapingJob.findMany({
      where,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: query.limit + 1,
      include: { source: true },
    });
    const page = sliceKeysetPage(rows, query.limit, (row) =>
      encodeCursor('created', { value: row.createdAt.toISOString(), id: row.id }),
    );
    return { items: page.items.map(toJobDto), nextCursor: page.nextCursor };
  }

  async get(id: string): Promise<ScrapingJobDto> {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    return toJobDto(job);
  }

  async create(dto: CreateJobDto): Promise<ScrapingJobDto> {
    return this.enqueue(dto.source, dto.slugs);
  }

  async cancel(id: string): Promise<ScrapingJobDto> {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    assertCancellable(fromDbJobStatus(job.status));

    // Guarded by status so a job finishing meanwhile is not overwritten.
    const { count } = await this.prisma.scrapingJob.updateMany({
      where: { id, status: { in: ['QUEUED', 'RUNNING'] } },
      data: { status: 'CANCELLED', completedAt: new Date() },
    });
    if (count === 0) {
      const current = await this.prisma.scrapingJob.findUnique({
        where: { id },
        select: { status: true },
      });
      if (!current) throw new NotFoundException(`Job ${id} not found`);
      assertCancellable(fromDbJobStatus(current.status));
    }

    await this.removeWaitingJobs(fromDbSourceKey(job.source.key), id);
    return this.get(id);
  }

  async retry(id: string): Promise<ScrapingJobDto> {
    const job = await this.prisma.scrapingJob.findUnique({
      where: { id },
      include: { source: true },
    });
    if (!job) throw new NotFoundException(`Job ${id} not found`);
    assertRetryable(fromDbJobStatus(job.status));
    return this.enqueue(fromDbSourceKey(job.source.key), slugsFromParams(job.params));
  }

  private async enqueue(source: SourceKey, slugs?: string[]): Promise<ScrapingJobDto> {
    assertSourceReviewed(source);
    const policy = SOURCE_POLICIES[source];
    const dbKey = toDbSourceKey(source) as DbSourceKey;
    const sourceRow = await this.prisma.source.upsert({
      where: { key: dbKey },
      update: {},
      create: {
        key: dbKey,
        name: source,
        rateLimitMax: policy.limiter.max,
        rateLimitDurationMs: policy.limiter.durationMs,
      },
    });
    const params: Prisma.InputJsonObject = slugs && slugs.length > 0 ? { slugs } : {};
    const job = await this.prisma.scrapingJob.create({
      data: { sourceId: sourceRow.id, name: `${source} scrape`, params },
    });

    try {
      const queued = await this.queues[source].add(
        'plan',
        buildPlanTaskData(job.id, source, slugs),
        buildPlanJobOptions(source, job.id),
      );
      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: { bullJobId: queued.id ?? null },
      });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await this.prisma.scrapingJob.update({
        where: { id: job.id },
        data: {
          status: 'FAILED',
          errorCount: 1,
          errors: [`Could not enqueue: ${message}`],
          completedAt: new Date(),
        },
      });
      throw error;
    }
    return this.get(job.id);
  }

  /** Best-effort: a failure here must not undo the cancellation. */
  private async removeWaitingJobs(source: SourceKey, scrapingJobId: string): Promise<void> {
    try {
      const waiting = await this.queues[source].getJobs(['waiting', 'delayed', 'prioritized']);
      await Promise.all(
        waiting
          .filter((j) => j.data.scrapingJobId === scrapingJobId)
          .map(async (j) => {
            try {
              await j.remove();
            } catch (error) {
              this.logger.warn(`Could not remove queue job ${j.id ?? '?'}: ${String(error)}`);
            }
          }),
      );
    } catch (error) {
      this.logger.warn(`Could not clean queue for job ${scrapingJobId}: ${String(error)}`);
    }
  }
}
