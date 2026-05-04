import { scrapingAdapter, initialScrapingState, ScrapingState } from './scraping.state';
import {
  selectActiveJobs,
  selectCompletedJobs,
  selectFailedJobs,
  selectTotalLeadsFound,
  selectJobSuccessRate,
  selectSelectedJob,
} from './scraping.selectors';
import { ScrapingJob } from '../../models/scraping-job.model';

function makeJob(overrides: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: 'job-1',
    name: 'Test',
    source: 'linkedin',
    targetUrl: 'https://linkedin.com',
    depth: 2,
    status: 'queued',
    progress: 0,
    leadsFound: 0,
    leadsTarget: 100,
    errorCount: 0,
    createdAt: new Date('2024-01-01'),
    filters: {},
    priority: 'normal',
    ...overrides,
  };
}

function stateWith(jobs: ScrapingJob[], partial: Partial<ScrapingState> = {}): { scraping: ScrapingState } {
  const entityState = scrapingAdapter.setAll(jobs, initialScrapingState);
  return { scraping: { ...entityState, ...partial } };
}

describe('selectActiveJobs', () => {
  it('includes running and queued jobs', () => {
    const jobs = [
      makeJob({ id: '1', status: 'running' }),
      makeJob({ id: '2', status: 'queued' }),
      makeJob({ id: '3', status: 'completed' }),
      makeJob({ id: '4', status: 'failed' }),
    ];
    const result = selectActiveJobs(stateWith(jobs));
    expect(result).toHaveLength(2);
    expect(result.map(j => j.id)).toEqual(expect.arrayContaining(['1', '2']));
  });

  it('returns empty when no active jobs', () => {
    const jobs = [makeJob({ status: 'completed' }), makeJob({ id: '2', status: 'failed' })];
    expect(selectActiveJobs(stateWith(jobs))).toHaveLength(0);
  });
});

describe('selectCompletedJobs', () => {
  it('returns only completed jobs', () => {
    const jobs = [
      makeJob({ id: '1', status: 'completed' }),
      makeJob({ id: '2', status: 'failed' }),
      makeJob({ id: '3', status: 'running' }),
    ];
    const result = selectCompletedJobs(stateWith(jobs));
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('selectFailedJobs', () => {
  it('includes failed and cancelled jobs', () => {
    const jobs = [
      makeJob({ id: '1', status: 'failed' }),
      makeJob({ id: '2', status: 'cancelled' }),
      makeJob({ id: '3', status: 'completed' }),
      makeJob({ id: '4', status: 'running' }),
    ];
    const result = selectFailedJobs(stateWith(jobs));
    expect(result).toHaveLength(2);
    expect(result.map(j => j.id)).toEqual(expect.arrayContaining(['1', '2']));
  });
});

describe('selectTotalLeadsFound', () => {
  it('sums leadsFound from completed jobs only', () => {
    const jobs = [
      makeJob({ id: '1', status: 'completed', leadsFound: 30 }),
      makeJob({ id: '2', status: 'completed', leadsFound: 70 }),
      makeJob({ id: '3', status: 'running', leadsFound: 50 }),
    ];
    expect(selectTotalLeadsFound(stateWith(jobs))).toBe(100);
  });

  it('returns 0 when no completed jobs exist', () => {
    const jobs = [makeJob({ status: 'running', leadsFound: 50 })];
    expect(selectTotalLeadsFound(stateWith(jobs))).toBe(0);
  });

  it('returns 0 when state is empty', () => {
    expect(selectTotalLeadsFound(stateWith([]))).toBe(0);
  });
});

describe('selectJobSuccessRate', () => {
  it('returns 0 when no finished jobs', () => {
    const jobs = [makeJob({ status: 'running' }), makeJob({ id: '2', status: 'queued' })];
    expect(selectJobSuccessRate(stateWith(jobs))).toBe(0);
  });

  it('calculates 50% success rate correctly', () => {
    const jobs = [
      makeJob({ id: '1', status: 'completed' }),
      makeJob({ id: '2', status: 'completed' }),
      makeJob({ id: '3', status: 'failed' }),
      makeJob({ id: '4', status: 'failed' }),
    ];
    expect(selectJobSuccessRate(stateWith(jobs))).toBe(50);
  });

  it('returns 100 when all finished jobs completed', () => {
    const jobs = [
      makeJob({ id: '1', status: 'completed' }),
      makeJob({ id: '2', status: 'completed' }),
    ];
    expect(selectJobSuccessRate(stateWith(jobs))).toBe(100);
  });

  it('returns 0 when all finished jobs failed', () => {
    const jobs = [
      makeJob({ id: '1', status: 'failed' }),
      makeJob({ id: '2', status: 'failed' }),
    ];
    expect(selectJobSuccessRate(stateWith(jobs))).toBe(0);
  });

  it('ignores running/queued jobs in calculation', () => {
    const jobs = [
      makeJob({ id: '1', status: 'completed' }),
      makeJob({ id: '2', status: 'running' }),
      makeJob({ id: '3', status: 'queued' }),
    ];
    expect(selectJobSuccessRate(stateWith(jobs))).toBe(100);
  });
});

describe('selectSelectedJob', () => {
  it('returns the job matching selectedJobId', () => {
    const job = makeJob({ id: '1' });
    const state = stateWith([job], { selectedJobId: '1' });
    expect(selectSelectedJob(state)?.id).toBe('1');
  });

  it('returns null when selectedJobId is null', () => {
    const state = stateWith([makeJob()], { selectedJobId: null });
    expect(selectSelectedJob(state)).toBeNull();
  });

  it('returns null when selectedJobId does not match any job', () => {
    const state = stateWith([makeJob({ id: '1' })], { selectedJobId: 'not-found' });
    expect(selectSelectedJob(state)).toBeNull();
  });
});
