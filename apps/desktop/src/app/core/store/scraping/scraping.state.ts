import { EntityState, createEntityAdapter } from '@ngrx/entity';
import { ScrapingJob } from '../../models/scraping-job.model';

export interface ScrapingState extends EntityState<ScrapingJob> {
  loading: boolean;
  error: string | null;
  selectedJobId: string | null;
  activeTab: 'active' | 'completed' | 'failed';
}

export const scrapingAdapter = createEntityAdapter<ScrapingJob>({ selectId: j => j.id });

export const initialScrapingState: ScrapingState = scrapingAdapter.getInitialState({
  loading: false,
  error: null,
  selectedJobId: null,
  activeTab: 'active',
});
