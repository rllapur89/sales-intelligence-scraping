import { createReducer, on } from '@ngrx/store';
import { ScrapingActions } from './scraping.actions';
import { scrapingAdapter, initialScrapingState } from './scraping.state';
import { JobStatus } from '../../models/scraping-job.model';

const MAX_RUNNING = 3;

export const scrapingReducer = createReducer(
  initialScrapingState,

  on(ScrapingActions.loadJobs, state => ({ ...state, loading: true, error: null })),

  on(ScrapingActions.loadJobsSuccess, (state, { jobs }) => {
    let runningCount = 0;
    const normalized = jobs.map(j => {
      if (j.status === 'running') {
        if (runningCount < MAX_RUNNING) { runningCount++; return j; }
        return { ...j, status: 'queued' as JobStatus, startedAt: undefined };
      }
      return j;
    });
    return scrapingAdapter.setAll(normalized, { ...state, loading: false });
  }),

  on(ScrapingActions.jobsSynced, (state, { jobs }) =>
    scrapingAdapter.setAll(jobs, { ...state, loading: false, error: null })
  ),

  on(ScrapingActions.loadJobsFailure, (state, { error }) => ({
    ...state, loading: false, error
  })),

  on(ScrapingActions.startJobSuccess, (state, { job }) =>
    scrapingAdapter.addOne(job, state)
  ),

  on(ScrapingActions.cancelJob, (state, { id }) =>
    scrapingAdapter.updateOne({ id, changes: { status: 'cancelled' } }, state)
  ),

  on(ScrapingActions.retryJob, (state, { id }) =>
    scrapingAdapter.updateOne({ id, changes: { status: 'queued', progress: 0, errorCount: 0 } }, state)
  ),

  on(ScrapingActions.promoteJob, (state, { id }) =>
    scrapingAdapter.updateOne({ id, changes: { status: 'running', startedAt: new Date() } }, state)
  ),

  on(ScrapingActions.updateJobProgress, (state, { progress }) =>
    scrapingAdapter.updateOne({
      id: progress.jobId,
      changes: {
        progress: progress.progress,
        leadsFound: progress.leadsFound,
        errorCount: progress.errorCount,
        status: progress.status,
      }
    }, state)
  ),

  on(ScrapingActions.jobCompleted, (state, { id }) =>
    scrapingAdapter.updateOne({
      id,
      changes: { status: 'completed', progress: 100, completedAt: new Date() }
    }, state)
  ),

  on(ScrapingActions.jobFailed, (state, { id }) =>
    scrapingAdapter.updateOne({ id, changes: { status: 'failed', completedAt: new Date() } }, state)
  ),

  on(ScrapingActions.selectJob, (state, { id }) => ({
    ...state, selectedJobId: id
  })),

  on(ScrapingActions.setActiveTab, (state, { tab }) => ({
    ...state, activeTab: tab
  })),
);
