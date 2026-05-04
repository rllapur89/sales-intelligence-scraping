import { createActionGroup, emptyProps, props } from '@ngrx/store';
import { Lead, LeadFilter, BulkSelection } from '../../models/lead.model';

export const LeadsActions = createActionGroup({
  source: 'Leads',
  events: {
    'Load Leads': emptyProps(),
    'Load Leads Success': props<{ leads: Lead[] }>(),
    'Load Leads Failure': props<{ error: string }>(),

    'Select Lead': props<{ id: string }>(),
    'Deselect Lead': props<{ id: string }>(),
    'Select All': emptyProps(),
    'Clear Selection': emptyProps(),

    'Set Filter': props<{ filter: Partial<LeadFilter> }>(),
    'Reset Filter': emptyProps(),

    'Update Lead': props<{ lead: Lead }>(),
    'Delete Lead': props<{ id: string }>(),

    'Export Leads': emptyProps(),
    'Export Leads Success': props<{ count: number }>(),

    'Refresh Lead Scraping': props<{ id: string }>(),
    'Refresh Lead Scraping Success': props<{ lead: Lead }>(),

    'Add Lead': props<{ lead: Lead }>(),
  }
});
