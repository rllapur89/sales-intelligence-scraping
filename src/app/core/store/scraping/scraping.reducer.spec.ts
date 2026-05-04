import { scrapingReducer } from './scraping.reducer';
import { initialScrapingState } from './scraping.state';
import { ScrapingActions } from './scraping.actions';
import { ScrapingJob, JobProgress } from '../../models/scraping-job.model';

function makeJob(overrides: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: 'job-1',
    name: 'Test Job',
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

describe('scrapingReducer', () => {
  it('initializes with default state', () => {
    const state = scrapingReducer(undefined, { type: '@@INIT' } as any);
    expect(state.loading).toBe(false);
    expect(state.ids).toHaveLength(0);
    expect(state.activeTab).toBe('active');
    expect(state.selectedJobId).toBeNull();
  });

  describe('loadJobs', () => {
    it('sets loading true and clears error', () => {
      const state = scrapingReducer(
        { ...initialScrapingState, error: 'old error' },
        ScrapingActions.loadJobs()
      );
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe('loadJobsSuccess', () => {
    it('sets all jobs and loading false', () => {
      const jobs = [makeJob({ id: '1' }), makeJob({ id: '2' })];
      const state = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs }));
      expect(state.loading).toBe(false);
      expect(state.ids).toHaveLength(2);
    });

    it('enforces MAX_RUNNING=3: demotes extra running jobs to queued', () => {
      const jobs = [
        makeJob({ id: '1', status: 'running' }),
        makeJob({ id: '2', status: 'running' }),
        makeJob({ id: '3', status: 'running' }),
        makeJob({ id: '4', status: 'running' }),
        makeJob({ id: '5', status: 'running' }),
      ];
      const state = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs }));
      const e = state.entities as Record<string, ScrapingJob>;
      expect(e['1'].status).toBe('running');
      expect(e['2'].status).toBe('running');
      expect(e['3'].status).toBe('running');
      expect(e['4'].status).toBe('queued');
      expect(e['5'].status).toBe('queued');
    });

    it('allows exactly 3 running jobs without demotion', () => {
      const jobs = [
        makeJob({ id: '1', status: 'running' }),
        makeJob({ id: '2', status: 'running' }),
        makeJob({ id: '3', status: 'running' }),
      ];
      const state = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs }));
      const e = state.entities as Record<string, ScrapingJob>;
      expect(e['1'].status).toBe('running');
      expect(e['2'].status).toBe('running');
      expect(e['3'].status).toBe('running');
    });

    it('does not demote non-running jobs', () => {
      const jobs = [
        makeJob({ id: '1', status: 'running' }),
        makeJob({ id: '2', status: 'queued' }),
        makeJob({ id: '3', status: 'completed' }),
      ];
      const state = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs }));
      const e = state.entities as Record<string, ScrapingJob>;
      expect(e['2'].status).toBe('queued');
      expect(e['3'].status).toBe('completed');
    });
  });

  describe('loadJobsFailure', () => {
    it('sets error and clears loading', () => {
      const state = scrapingReducer(
        { ...initialScrapingState, loading: true },
        ScrapingActions.loadJobsFailure({ error: 'Timeout' })
      );
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Timeout');
    });
  });

  describe('startJobSuccess', () => {
    it('adds new job to state', () => {
      const job = makeJob({ id: 'new-job' });
      const state = scrapingReducer(initialScrapingState, ScrapingActions.startJobSuccess({ job }));
      expect(state.ids).toContain('new-job');
    });
  });

  describe('cancelJob', () => {
    it('sets job status to cancelled', () => {
      const job = makeJob({ id: '1', status: 'running' });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const state = scrapingReducer(withJob, ScrapingActions.cancelJob({ id: '1' }));
      expect((state.entities as any)['1'].status).toBe('cancelled');
    });
  });

  describe('retryJob', () => {
    it('resets status to queued, progress to 0, errorCount to 0', () => {
      const job = makeJob({ id: '1', status: 'failed', progress: 60, errorCount: 5 });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const state = scrapingReducer(withJob, ScrapingActions.retryJob({ id: '1' }));
      const entity = (state.entities as any)['1'];
      expect(entity.status).toBe('queued');
      expect(entity.progress).toBe(0);
      expect(entity.errorCount).toBe(0);
    });
  });

  describe('promoteJob', () => {
    it('sets status to running and assigns startedAt', () => {
      const job = makeJob({ id: '1', status: 'queued' });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const state = scrapingReducer(withJob, ScrapingActions.promoteJob({ id: '1' }));
      const entity = (state.entities as any)['1'];
      expect(entity.status).toBe('running');
      expect(entity.startedAt).toBeInstanceOf(Date);
    });
  });

  describe('updateJobProgress', () => {
    it('updates progress, leadsFound and errorCount', () => {
      const job = makeJob({ id: '1', status: 'running' });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const progress: JobProgress = { jobId: '1', progress: 75, leadsFound: 50, errorCount: 2, status: 'running' };
      const state = scrapingReducer(withJob, ScrapingActions.updateJobProgress({ progress }));
      const entity = (state.entities as any)['1'];
      expect(entity.progress).toBe(75);
      expect(entity.leadsFound).toBe(50);
      expect(entity.errorCount).toBe(2);
    });
  });

  describe('jobCompleted', () => {
    it('sets status completed, progress 100, and completedAt', () => {
      const job = makeJob({ id: '1', status: 'running', progress: 90 });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const state = scrapingReducer(withJob, ScrapingActions.jobCompleted({ id: '1' }));
      const entity = (state.entities as any)['1'];
      expect(entity.status).toBe('completed');
      expect(entity.progress).toBe(100);
      expect(entity.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('jobFailed', () => {
    it('sets status failed and completedAt', () => {
      const job = makeJob({ id: '1', status: 'running' });
      const withJob = scrapingReducer(initialScrapingState, ScrapingActions.loadJobsSuccess({ jobs: [job] }));
      const state = scrapingReducer(withJob, ScrapingActions.jobFailed({ id: '1', error: 'Connection refused' }));
      const entity = (state.entities as any)['1'];
      expect(entity.status).toBe('failed');
      expect(entity.completedAt).toBeInstanceOf(Date);
    });
  });

  describe('selectJob', () => {
    it('stores selectedJobId', () => {
      const state = scrapingReducer(initialScrapingState, ScrapingActions.selectJob({ id: 'job-x' }));
      expect(state.selectedJobId).toBe('job-x');
    });
  });

  describe('setActiveTab', () => {
    it('updates activeTab', () => {
      const state = scrapingReducer(initialScrapingState, ScrapingActions.setActiveTab({ tab: 'completed' }));
      expect(state.activeTab).toBe('completed');
    });

    it('switches between all tabs', () => {
      const s1 = scrapingReducer(initialScrapingState, ScrapingActions.setActiveTab({ tab: 'failed' }));
      expect(s1.activeTab).toBe('failed');
      const s2 = scrapingReducer(s1, ScrapingActions.setActiveTab({ tab: 'active' }));
      expect(s2.activeTab).toBe('active');
    });
  });
});
