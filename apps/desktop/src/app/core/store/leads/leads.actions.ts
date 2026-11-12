import { createActionGroup, emptyProps, props } from '@ngrx/store';
import type { LeadBatch } from '@leads/shared';
import { Lead, LeadFilter } from '../../models/lead.model';
import { RealtimeStatus } from '../../models/connection.model';

export const LeadsActions = createActionGroup({
  source: 'Leads',
  events: {
    'Load Leads': emptyProps(),
    'Load Leads Success': props<{ leads: Lead[] }>(),
    /** Live mode: the cached snapshot shown while the REST snapshot is still pending. */
    'Load Leads From Cache': props<{ leads: Lead[]; lastSeq: number; savedAt: number }>(),
    'Load Leads Failure': props<{ error: string }>(),

    'Select Lead': props<{ id: string }>(),
    'Deselect Lead': props<{ id: string }>(),
    'Toggle Lead Selection': props<{ id: string }>(),
    'Select All': emptyProps(),
    'Clear Selection': emptyProps(),

    'Set Filter': props<{ filter: Partial<LeadFilter> }>(),
    'Reset Filter': emptyProps(),

    'Update Lead': props<{ lead: Lead; previous?: Lead }>(),
    'Update Lead Success': props<{ lead: Lead }>(),
    'Update Lead Failure': props<{ previous: Lead; error: string }>(),
    'Delete Lead': props<{ id: string }>(),

    'Export Leads': emptyProps(),
    'Export Leads Success': props<{ count: number }>(),

    'Refresh Lead Scraping': props<{ id: string }>(),
    'Refresh Lead Scraping Success': props<{ lead: Lead }>(),
    'Refresh Lead Scraping Failure': props<{ id: string; error: string }>(),

    'Add Lead': props<{ lead: Lead }>(),

    // Realtime
    /** One live (or replayed) batch from the gateway: a single dispatch, no per-row work. */
    'Upsert Batch': props<{ batch: LeadBatch; origin?: 'live' | 'resync' }>(),
    /** The hub says these leads no longer match the user's subscriptions: drop them (live mode). */
    'Retract Leads': props<{ leadIds: string[]; seq: number }>(),
    'Reset Seq': props<{ lastSeq: number }>(),
    'Set Connection': props<{ status: RealtimeStatus }>(),
    'Clear Changed': emptyProps(),
  }
});
