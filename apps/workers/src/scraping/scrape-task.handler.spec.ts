import { describe, expect, it, vi } from 'vitest';
import {
  SOURCE_POLICIES,
  type CompanyTarget,
  type RawSignalItem,
  type ScrapeTaskData,
  type SourceKey,
} from '@leads/shared';
import { HttpError } from '../http/http-client';
import type { ScrapeJobStore, StoredJobStatus } from './job-store';
import { ScrapeTaskHandler, type ScrapeTaskDeps } from './scrape-task.handler';

const target: CompanyTarget = { slug: 'acme', name: 'Acme', domain: 'acme.com' };
const item: RawSignalItem = {
  company: { name: 'Acme', domain: 'acme.com' },
  signal: {
    type: 'hiring',
    externalId: 'gh:acme:1',
    detectedAt: '2026-01-01T00:00:00Z',
    payload: {},
  },
};

const companyTask: Extract<ScrapeTaskData, { kind: 'company' }> = {
  kind: 'company',
  scrapingJobId: 'job1',
  source: 'greenhouse',
  target,
};
const planTask: Extract<ScrapeTaskData, { kind: 'plan' }> = {
  kind: 'plan',
  scrapingJobId: 'job1',
  source: 'greenhouse',
};

function setup(status: StoredJobStatus | null, scrape = vi.fn().mockResolvedValue([item])) {
  const jobs = {
    getStatus: vi.fn().mockResolvedValue(status),
    markRunning: vi.fn().mockResolvedValue(undefined),
    fail: vi.fn().mockResolvedValue(undefined),
    recordTask: vi.fn().mockResolvedValue(false),
    recordSourceOutcome: vi.fn().mockResolvedValue(undefined),
  } satisfies ScrapeJobStore;
  const deps = {
    scrapers: new Map([['greenhouse', { source: 'greenhouse', scrape }]]),
    jobs,
    policyFor: (s: SourceKey) => SOURCE_POLICIES[s],
    loadTargets: vi.fn().mockReturnValue([target, { ...target, slug: 'b', domain: 'b.com' }]),
    enqueueCompany: vi.fn().mockResolvedValue(undefined),
    publishRaw: vi.fn().mockResolvedValue(undefined),
    now: () => 1_000,
  } as unknown as ScrapeTaskDeps;
  const pauseQueue = vi.fn().mockResolvedValue(undefined);
  return {
    handler: new ScrapeTaskHandler(deps),
    deps,
    jobs,
    scrape,
    pauseQueue,
    ctx: (attemptsMade = 0) => ({ attemptsMade, pauseQueue }),
  };
}

describe('ScrapeTaskHandler plan', () => {
  it('marks the job running and fans out one task per target', async () => {
    const s = setup('QUEUED');
    expect(await s.handler.handle(planTask, s.ctx())).toBe('planned');
    expect(s.jobs.markRunning).toHaveBeenCalledWith('job1', 2);
    expect(s.deps.enqueueCompany).toHaveBeenCalledTimes(2);
  });

  it('fails the job when no target matches', async () => {
    const s = setup('QUEUED');
    vi.mocked(s.deps.loadTargets).mockReturnValue([]);
    expect(await s.handler.handle(planTask, s.ctx())).toBe('failed');
    expect(s.jobs.fail).toHaveBeenCalled();
    expect(s.deps.enqueueCompany).not.toHaveBeenCalled();
  });

  it('does nothing for a cancelled job', async () => {
    const s = setup('CANCELLED');
    expect(await s.handler.handle(planTask, s.ctx())).toBe('skipped');
    expect(s.jobs.markRunning).not.toHaveBeenCalled();
  });
});

describe('ScrapeTaskHandler company task', () => {
  it('scrapes, hands raw results to ingestion and counts the task', async () => {
    const s = setup('RUNNING');
    expect(await s.handler.handle(companyTask, s.ctx())).toBe('scraped');
    expect(s.deps.publishRaw).toHaveBeenCalledWith({
      source: 'greenhouse',
      jobId: 'job1',
      target: 'acme',
      scrapedAt: 1_000,
      items: [item],
    });
    expect(s.jobs.recordTask).toHaveBeenCalledWith('job1', { itemsFound: 1 });
    expect(s.jobs.recordSourceOutcome).toHaveBeenCalledWith('greenhouse', { ok: true });
  });

  it('skips work when the job was cancelled', async () => {
    const s = setup('CANCELLED');
    expect(await s.handler.handle(companyTask, s.ctx())).toBe('skipped');
    expect(s.scrape).not.toHaveBeenCalled();
    expect(s.deps.publishRaw).not.toHaveBeenCalled();
  });

  it('rethrows retryable errors before the last attempt without recording a failure', async () => {
    const s = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('503', 503)));
    await expect(s.handler.handle(companyTask, s.ctx(0))).rejects.toMatchObject({ status: 503 });
    expect(s.jobs.recordTask).not.toHaveBeenCalled();
  });

  it('records a failure on the last attempt instead of throwing', async () => {
    const s = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('503', 503)));
    const last = SOURCE_POLICIES.greenhouse.attempts - 1;
    expect(await s.handler.handle(companyTask, s.ctx(last))).toBe('failed');
    expect(s.jobs.recordTask).toHaveBeenCalledWith(
      'job1',
      expect.objectContaining({ itemsFound: 0, error: expect.stringContaining('acme') }),
    );
    expect(s.jobs.recordSourceOutcome).toHaveBeenCalledWith(
      'greenhouse',
      expect.objectContaining({ ok: false }),
    );
  });

  it('records a non-retryable 404 immediately, on the first attempt', async () => {
    const s = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('404', 404)));
    expect(await s.handler.handle(companyTask, s.ctx(0))).toBe('failed');
    expect(s.jobs.recordTask).toHaveBeenCalledTimes(1);
  });

  it('pauses the whole queue for Retry-After on 429, then retries the task', async () => {
    const s = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('429', 429, 7000)));
    await expect(s.handler.handle(companyTask, s.ctx(0))).rejects.toMatchObject({ status: 429 });
    expect(s.pauseQueue).toHaveBeenCalledWith(7000);
    expect(s.jobs.recordTask).not.toHaveBeenCalled();
  });

  it('also pauses the queue on a rate-limited 403 (GitHub secondary limit, SEC block)', async () => {
    const s = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('403', 403, 600_000, true)));
    await expect(s.handler.handle(companyTask, s.ctx(0))).rejects.toMatchObject({ status: 403 });
    expect(s.pauseQueue).toHaveBeenCalledWith(600_000);
    const plain = setup('RUNNING', vi.fn().mockRejectedValue(new HttpError('403', 403)));
    expect(await plain.handler.handle(companyTask, plain.ctx(0))).toBe('failed');
    expect(plain.pauseQueue).not.toHaveBeenCalled();
  });

  it('does not count the task if handing results to ingestion fails', async () => {
    const s = setup('RUNNING');
    vi.mocked(s.deps.publishRaw).mockRejectedValue(new Error('redis down'));
    await expect(s.handler.handle(companyTask, s.ctx(0))).rejects.toThrow('redis down');
    expect(s.jobs.recordTask).not.toHaveBeenCalled();
  });
});
