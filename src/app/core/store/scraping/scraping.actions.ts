import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ScrapingJob, JobProgress, ScrapingSource, JobFilter } from '../../models/scraping-job.model';

export const ScrapingActions = createActionGroup({
  source: 'Scraping',
  events: {
    'Load Jobs': emptyProps(),
    'Load Jobs Success': props<{ jobs: ScrapingJob[] }>(),
    'Load Jobs Failure': props<{ error: string }>(),

    'Start Job': props<{ name: string; source: ScrapingSource; targetUrl: string; depth: number; filters: JobFilter }>(),
    'Start Job Success': props<{ job: ScrapingJob }>(),

    'Cancel Job': props<{ id: string }>(),
    'Retry Job': props<{ id: string }>(),
    'Promote Job': props<{ id: string }>(),

    'Update Job Progress': props<{ progress: JobProgress }>(),
    'Job Completed': props<{ id: string }>(),
    'Job Failed': props<{ id: string; error: string }>(),

    'Select Job': props<{ id: string | null }>(),
    'Set Active Tab': props<{ tab: 'active' | 'completed' | 'failed' }>(),
  }
});
