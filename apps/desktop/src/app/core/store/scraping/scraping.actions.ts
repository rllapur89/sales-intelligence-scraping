import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { ScrapingJob, JobProgress, ScrapingSource } from '../../models/scraping-job.model';

export const ScrapingActions = createActionGroup({
  source: 'Scraping',
  events: {
    'Load Jobs': emptyProps(),
    'Load Jobs Success': props<{ jobs: ScrapingJob[] }>(),
    'Load Jobs Failure': props<{ error: string }>(),

    /** Live mode: re-read from the server (setAll, no mock slot normalization). */
    'Jobs Synced': props<{ jobs: ScrapingJob[] }>(),

    'Start Job': props<{ name: string; source: ScrapingSource; slugs: string[] }>(),
    'Start Job Success': props<{ job: ScrapingJob }>(),
    'Start Job Failure': props<{ error: string }>(),

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
