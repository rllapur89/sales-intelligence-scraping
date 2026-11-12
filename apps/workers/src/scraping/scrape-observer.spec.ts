import { describe, expect, it, vi } from 'vitest';
import { SOURCE_POLICIES, type ScrapeTaskData, type SourceKey } from '@leads/shared';
import { HttpError } from '../http/http-client';
import type { ScrapeObserver } from '../telemetry/scrape-observer';
import type { ScrapeJobStore } from './job-store';
import { ScrapeTaskHandler, type ScrapeTaskDeps } from './scrape-task.handler';

const task: Extract<ScrapeTaskData, { kind: 'company' }> = {
  kind: 'company',
  scrapingJobId: 'job1',
  source: 'greenhouse',
  target: { slug: 'acme', name: 'Acme', domain: 'acme.com' },
};

function build(scrape: () => Promise<unknown[]>, clock: number[]) {
  const observer: ScrapeObserver = {
    taskFinished: vi.fn(),
    itemsFound: vi.fn(),
    rateLimited: vi.fn(),
    retried: vi.fn(),
  };
  const jobs = {
    getStatus: vi.fn().mockResolvedValue('RUNNING'),
    markRunning: vi.fn(),
    fail: vi.fn(),
    recordTask: vi.fn().mockResolvedValue(false),
    recordSourceOutcome: vi.fn(),
  } satisfies ScrapeJobStore;
  const deps = {
    scrapers: new Map([['greenhouse', { source: 'greenhouse', scrape }]]),
    jobs,
    policyFor: (s: SourceKey) => SOURCE_POLICIES[s],
    loadTargets: vi.fn(),
    enqueueCompany: vi.fn(),
    publishRaw: vi.fn().mockResolvedValue(undefined),
    now: () => clock.shift() ?? 0,
    observer,
  } as unknown as ScrapeTaskDeps;
  const pauseQueue = vi.fn().mockResolvedValue(undefined);
  return { handler: new ScrapeTaskHandler(deps), observer, pauseQueue };
}

describe('ScrapeTaskHandler observer', () => {
  it('reports items found and the task duration on success', async () => {
    const s = build(() => Promise.resolve([{}, {}, {}]), [1000, 3500]);
    await s.handler.handle(task, { attemptsMade: 0, pauseQueue: s.pauseQueue });
    expect(s.observer.itemsFound).toHaveBeenCalledWith('greenhouse', 3);
    expect(s.observer.taskFinished).toHaveBeenCalledWith('greenhouse', 'scraped', 2.5);
  });

  it('reports a retry, not a failure, while attempts remain', async () => {
    const s = build(() => Promise.reject(new Error('boom')), [0, 0]);
    await expect(
      s.handler.handle(task, { attemptsMade: 0, pauseQueue: s.pauseQueue }),
    ).rejects.toThrow('boom');
    expect(s.observer.retried).toHaveBeenCalledWith('greenhouse');
    expect(s.observer.taskFinished).not.toHaveBeenCalled();
  });

  it('reports a failure on the last attempt', async () => {
    const s = build(() => Promise.reject(new Error('boom')), [0, 4000]);
    const last = SOURCE_POLICIES.greenhouse.attempts - 1;
    await s.handler.handle(task, { attemptsMade: last, pauseQueue: s.pauseQueue });
    expect(s.observer.taskFinished).toHaveBeenCalledWith('greenhouse', 'failed', 4);
    expect(s.observer.retried).not.toHaveBeenCalled();
  });

  it('reports a rate limit with the pause it asked for', async () => {
    const err = new HttpError('limited', 429, 7000);
    const s = build(() => Promise.reject(err), [0, 0]);
    await expect(
      s.handler.handle(task, { attemptsMade: 0, pauseQueue: s.pauseQueue }),
    ).rejects.toBe(err);
    expect(s.observer.rateLimited).toHaveBeenCalledWith('greenhouse', 7000);
    expect(s.pauseQueue).toHaveBeenCalledWith(7000);
  });
});
