import { createFeatureSelector, createSelector } from '@ngrx/store';
import { ScrapingState, scrapingAdapter } from './scraping.state';

export const selectScrapingState = createFeatureSelector<ScrapingState>('scraping');

const { selectAll, selectEntities } = scrapingAdapter.getSelectors();

export const selectAllJobs = createSelector(selectScrapingState, selectAll);
export const selectJobEntities = createSelector(selectScrapingState, selectEntities);
export const selectScrapingLoading = createSelector(selectScrapingState, s => s.loading);
export const selectSelectedJobId = createSelector(selectScrapingState, s => s.selectedJobId);
export const selectActiveTab = createSelector(selectScrapingState, s => s.activeTab);

export const selectActiveJobs = createSelector(selectAllJobs, jobs =>
  jobs.filter(j => j.status === 'running' || j.status === 'queued')
);

export const selectCompletedJobs = createSelector(selectAllJobs, jobs =>
  jobs.filter(j => j.status === 'completed')
);

export const selectFailedJobs = createSelector(selectAllJobs, jobs =>
  jobs.filter(j => j.status === 'failed' || j.status === 'cancelled')
);

export const selectSelectedJob = createSelector(
  selectJobEntities,
  selectSelectedJobId,
  (entities, id) => (id ? entities[id] ?? null : null)
);

export const selectTotalLeadsFound = createSelector(
  selectCompletedJobs,
  jobs => jobs.reduce((sum, j) => sum + j.leadsFound, 0)
);

export const selectJobSuccessRate = createSelector(
  selectAllJobs,
  jobs => {
    const done = jobs.filter(j => j.status === 'completed' || j.status === 'failed');
    if (!done.length) return 0;
    return Math.round((jobs.filter(j => j.status === 'completed').length / done.length) * 100);
  }
);
