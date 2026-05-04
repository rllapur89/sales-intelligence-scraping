import { EntityState, createEntityAdapter } from '@ngrx/entity';
import { Lead, LeadFilter, BulkSelection, DEFAULT_FILTER } from '../../models/lead.model';

export interface LeadsState extends EntityState<Lead> {
  loading: boolean;
  error: string | null;
  filter: LeadFilter;
  selection: { mode: 'include' | 'exclude'; ids: string[] };
  selectedLeadId: string | null;
  totalCount: number;
  lastUpdated: Date | null;
  rescrapingIds: string[];
}

export const leadsAdapter = createEntityAdapter<Lead>({ selectId: l => l.id });

export const initialLeadsState: LeadsState = leadsAdapter.getInitialState({
  loading: false,
  error: null,
  filter: DEFAULT_FILTER,
  selection: { mode: 'include', ids: [] },
  selectedLeadId: null,
  totalCount: 0,
  lastUpdated: null,
  rescrapingIds: [],
});
