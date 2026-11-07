import { createReducer, on } from '@ngrx/store';
import { LeadsActions } from './leads.actions';
import { leadsAdapter, initialLeadsState } from './leads.state';
import { DEFAULT_FILTER } from '../../models/lead.model';
import { appendChangedIds, maxSeq, mergeSnapshot, pickFreshLeads } from './leads.batch';

export const leadsReducer = createReducer(
  initialLeadsState,

  on(LeadsActions.loadLeads, state => ({ ...state, loading: true, error: null })),

  on(LeadsActions.loadLeadsSuccess, (state, { leads }) => {
    // Keep versions that arrived through the socket while the snapshot was loading.
    const merged = mergeSnapshot(state.entities, leads);
    return leadsAdapter.setAll(merged, {
      ...state,
      loading: false,
      totalCount: merged.length,
      lastUpdated: new Date(),
      lastSeq: Math.max(state.lastSeq, maxSeq(merged)),
    });
  }),

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

  on(LeadsActions.toggleLeadSelection, (state, { id }) => {
    const { mode, ids } = state.selection;
    if (mode === 'exclude') {
      // exclude mode: ids = exceptions (deselected). Toggle adds/removes from exceptions.
      const newIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id];
      return { ...state, selection: { mode: 'exclude' as const, ids: newIds } };
    } else {
      // include mode: ids = selected. Toggle adds/removes.
      const newIds = ids.includes(id) ? ids.filter(i => i !== id) : [...ids, id];
      return { ...state, selection: { mode: 'include' as const, ids: newIds } };
    }
  }),

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

  on(LeadsActions.updateLeadSuccess, (state, { lead }) =>
    leadsAdapter.updateOne({ id: lead.id, changes: lead }, state)
  ),

  on(LeadsActions.updateLeadFailure, (state, { previous }) =>
    leadsAdapter.updateOne({ id: previous.id, changes: previous }, state)
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

  on(LeadsActions.refreshLeadScrapingFailure, (state, { id }) => ({
    ...state,
    rescrapingIds: state.rescrapingIds.filter(i => i !== id),
  })),

  on(LeadsActions.upsertBatch, (state, { batch }) => {
    const lastSeq = Math.max(state.lastSeq, batch.toSeq);
    const fresh = pickFreshLeads(state.entities, batch.leads);
    if (!fresh.length) return lastSeq === state.lastSeq ? state : { ...state, lastSeq };
    const next = leadsAdapter.upsertMany(fresh, state);
    return {
      ...next,
      totalCount: next.ids.length,
      lastUpdated: new Date(),
      lastSeq,
      changedIds: appendChangedIds(state.changedIds, fresh.map(l => l.id)),
    };
  }),

  on(LeadsActions.resetSeq, (state, { lastSeq }) => ({ ...state, lastSeq })),

  on(LeadsActions.setConnection, (state, { status }) =>
    state.connection === status ? state : { ...state, connection: status }
  ),

  on(LeadsActions.clearChanged, state =>
    state.changedIds.length ? { ...state, changedIds: [] } : state
  ),

  on(LeadsActions.addLead, (state, { lead }) =>
    leadsAdapter.addOne(lead, { ...state, totalCount: state.totalCount + 1 })
  ),
);
