import { createFeatureSelector, createSelector } from '@ngrx/store';
import { LeadsState, leadsAdapter } from './leads.state';
import { Lead, LeadFilter } from '../../models/lead.model';
import { ChartPoint } from '../../models/metrics.model';

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
export const selectLastSeq = createSelector(selectLeadsState, s => s.lastSeq);
export const selectConnection = createSelector(selectLeadsState, s => s.connection);
export const selectChangedIdSet = createSelector(selectLeadsState, s => new Set(s.changedIds));
export const selectRescrapingIds = createSelector(selectLeadsState, s => new Set(s.rescrapingIds));

export const selectSelectedLead = createSelector(
  selectLeadEntities,
  selectSelectedLeadId,
  (entities, id) => (id ? entities[id] ?? null : null)
);

export function applyFilter(leads: readonly Lead[], filter: LeadFilter): Lead[] {
  const term = filter.search.trim().toLowerCase();
  return leads.filter(lead => {
    const { company } = lead;
    if (term) {
      const match =
        company.name.toLowerCase().includes(term) ||
        company.domain.toLowerCase().includes(term) ||
        (company.industry ?? '').toLowerCase().includes(term) ||
        (company.region ?? '').toLowerCase().includes(term);
      if (!match) return false;
    }
    if (filter.industries.length && !(company.industry && filter.industries.includes(company.industry))) {
      return false;
    }
    if (filter.regions.length && !(company.region && filter.regions.includes(company.region))) {
      return false;
    }
    if (filter.companySizes.length && !(company.size && filter.companySizes.includes(company.size))) {
      return false;
    }
    if (filter.stages.length && !filter.stages.includes(lead.stage)) return false;
    if (lead.score < filter.scoreMin || lead.score > filter.scoreMax) return false;
    return true;
  });
}

/** Score descending, id as tie-breaker: the same order as the API snapshot. */
export function compareLeads(a: Lead, b: Lead): number {
  return b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
}

export const selectFilteredLeads = createSelector(
  selectAllLeads,
  selectLeadsFilter,
  (leads, filter) => applyFilter(leads, filter).sort(compareLeads)
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

function countBy(leads: readonly Lead[], pick: (lead: Lead) => string | null): ChartPoint[] {
  const counts = new Map<string, number>();
  for (const lead of leads) {
    const key = pick(lead);
    if (key) counts.set(key, (counts.get(key) ?? 0) + 1);
  }
  return [...counts.entries()]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value || a.label.localeCompare(b.label));
}

/** Lead count per industry, largest first (feeds filters, dashboard and reports). */
export const selectIndustryCounts = createSelector(selectAllLeads, leads =>
  countBy(leads, l => l.company.industry)
);
export const selectRegionCounts = createSelector(selectAllLeads, leads =>
  countBy(leads, l => l.company.region)
);
export const selectIndustryOptions = createSelector(selectIndustryCounts, counts =>
  counts.map(c => c.label).sort((a, b) => a.localeCompare(b))
);
export const selectRegionOptions = createSelector(selectRegionCounts, counts =>
  counts.map(c => c.label).sort((a, b) => a.localeCompare(b))
);

/** The leads an export acts on: the selected ones among those matching the current filter. */
export const selectLeadsForExport = createSelector(
  selectFilteredLeads,
  selectLeadsSelection,
  (leads, sel) => {
    const ids = new Set(sel.ids);
    return leads.filter(l => (sel.mode === 'include' ? ids.has(l.id) : !ids.has(l.id)));
  }
);
