import { createReducer, on } from '@ngrx/store';
import { LeadsActions } from './leads.actions';
import { leadsAdapter, initialLeadsState } from './leads.state';
import { DEFAULT_FILTER } from '../../models/lead.model';

export const leadsReducer = createReducer(
  initialLeadsState,

  on(LeadsActions.loadLeads, state => ({ ...state, loading: true, error: null })),

  on(LeadsActions.loadLeadsSuccess, (state, { leads }) =>
    leadsAdapter.setAll(leads, {
      ...state,
      loading: false,
      totalCount: leads.length,
      lastUpdated: new Date(),
    })
  ),

  on(LeadsActions.loadLeadsFailure, (state, { error }) => ({
    ...state,
    loading: false,
    error,
  })),

  on(LeadsActions.selectLead, (state, { id }) => ({
    ...state,
    selectedLeadId: id,
  })),

  on(LeadsActions.deselectLead, state => ({
    ...state,
    selectedLeadId: null,
  })),

  on(LeadsActions.selectAll, state => ({
    ...state,
    selection: { mode: 'exclude' as const, ids: [] },
  })),

  on(LeadsActions.clearSelection, state => ({
    ...state,
    selection: { mode: 'include' as const, ids: [] },
  })),

  on(LeadsActions.setFilter, (state, { filter }) => ({
    ...state,
    filter: { ...state.filter, ...filter },
  })),

  on(LeadsActions.resetFilter, state => ({
    ...state,
    filter: DEFAULT_FILTER,
  })),

  on(LeadsActions.updateLead, (state, { lead }) =>
    leadsAdapter.updateOne({ id: lead.id, changes: lead }, state)
  ),

  on(LeadsActions.deleteLead, (state, { id }) =>
    leadsAdapter.removeOne(id, state)
  ),

  on(LeadsActions.refreshLeadScraping, (state, { id }) => ({
    ...state,
    rescrapingIds: state.rescrapingIds.includes(id) ? state.rescrapingIds : [...state.rescrapingIds, id],
  })),

  on(LeadsActions.refreshLeadScrapingSuccess, (state, { lead }) =>
    leadsAdapter.updateOne(
      { id: lead.id, changes: lead },
      { ...state, rescrapingIds: state.rescrapingIds.filter(id => id !== lead.id) }
    )
  ),

  on(LeadsActions.addLead, (state, { lead }) =>
    leadsAdapter.addOne(lead, { ...state, totalCount: state.totalCount + 1 })
  ),
);
