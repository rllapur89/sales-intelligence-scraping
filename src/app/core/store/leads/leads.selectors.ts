import { createFeatureSelector, createSelector } from '@ngrx/store';
import { LeadsState, leadsAdapter } from './leads.state';
import { Lead, LeadFilter } from '../../models/lead.model';

export const selectLeadsState = createFeatureSelector<LeadsState>('leads');

const { selectAll, selectEntities, selectIds, selectTotal } = leadsAdapter.getSelectors();

export const selectAllLeads = createSelector(selectLeadsState, selectAll);
export const selectLeadEntities = createSelector(selectLeadsState, selectEntities);
export const selectLeadsLoading = createSelector(selectLeadsState, s => s.loading);
export const selectLeadsError = createSelector(selectLeadsState, s => s.error);
export const selectLeadsFilter = createSelector(selectLeadsState, s => s.filter);
export const selectLeadsSelection = createSelector(selectLeadsState, s => s.selection);
export const selectSelectedLeadId = createSelector(selectLeadsState, s => s.selectedLeadId);
export const selectLeadsTotalCount = createSelector(selectLeadsState, s => s.totalCount);
export const selectLeadsLastUpdated = createSelector(selectLeadsState, s => s.lastUpdated);
export const selectRescrapingIds = createSelector(selectLeadsState, s => new Set(s.rescrapingIds));

export const selectSelectedLead = createSelector(
  selectLeadEntities,
  selectSelectedLeadId,
  (entities, id) => (id ? entities[id] ?? null : null)
);

function applyFilter(leads: Lead[], filter: LeadFilter): Lead[] {
  return leads.filter(lead => {
    if (filter.search) {
      const s = filter.search.toLowerCase();
      const match =
        lead.firstName.toLowerCase().includes(s) ||
        lead.lastName.toLowerCase().includes(s) ||
        lead.company.toLowerCase().includes(s) ||
        lead.email.toLowerCase().includes(s) ||
        lead.role.toLowerCase().includes(s);
      if (!match) return false;
    }
    if (filter.industries.length && !filter.industries.includes(lead.industry)) return false;
    if (filter.countries.length && !filter.countries.includes(lead.country)) return false;
    if (filter.companySizes.length && !filter.companySizes.includes(lead.companySize)) return false;
    if (filter.statuses.length && !filter.statuses.includes(lead.status)) return false;
    if (lead.score < filter.scoreMin || lead.score > filter.scoreMax) return false;
    if (filter.assignedTo && lead.assignedTo !== filter.assignedTo) return false;
    return true;
  });
}

export const selectFilteredLeads = createSelector(
  selectAllLeads,
  selectLeadsFilter,
  applyFilter
);

export const selectFilteredCount = createSelector(selectFilteredLeads, leads => leads.length);

export const selectIsLeadSelected = (id: string) =>
  createSelector(selectLeadsSelection, sel => {
    if (sel.mode === 'include') return sel.ids.includes(id);
    return !sel.ids.includes(id);
  });

export const selectSelectedCount = createSelector(
  selectLeadsSelection,
  selectLeadsTotalCount,
  (sel, total) => sel.mode === 'include' ? sel.ids.length : total - sel.ids.length
);

export const selectHasSelection = createSelector(selectSelectedCount, count => count > 0);
export const selectIsAllSelected = createSelector(
  selectLeadsSelection,
  sel => sel.mode === 'exclude' && sel.ids.length === 0
);
