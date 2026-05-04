import { LeadsState } from './leads/leads.state';
import { ScrapingState } from './scraping/scraping.state';

export interface AppState {
  leads: LeadsState;
  scraping: ScrapingState;
}
