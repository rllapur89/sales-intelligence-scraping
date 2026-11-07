import { leadsAdapter, initialLeadsState, LeadsState } from './leads.state';
import {
  selectFilteredLeads,
  selectSelectedCount,
  selectIsAllSelected,
  selectHasSelection,
  selectSelectedLead,
  selectIndustryCounts,
  selectIndustryOptions,
  selectRegionOptions,
  selectLeadsForExport,
  selectLastSeq,
  selectConnection,
  selectChangedIdSet,
} from './leads.selectors';
import { Lead, DEFAULT_FILTER } from '../../models/lead.model';
import { makeLead } from '../../../../testing/factories';


function stateWith(leads: Lead[], partial: Partial<LeadsState> = {}): { leads: LeadsState } {
  const entityState = leadsAdapter.setAll(leads, initialLeadsState);
  return { leads: { ...entityState, ...partial } };
}

describe('selectFilteredLeads', () => {
  const leads = [
    makeLead({ id: '1', score: 90, stage: 'new', company: { name: 'Acme', domain: 'acme.com', industry: 'Tech', region: 'US', size: 'smb' } }),
    makeLead({ id: '2', score: 40, stage: 'won', company: { name: 'WidgetCo', domain: 'widget.io', industry: 'Finance', region: 'UK', size: 'enterprise' } }),
    makeLead({ id: '3', score: 60, stage: 'contacted', company: { name: 'StartupXYZ', domain: 'startupxyz.dev', industry: 'Tech', region: 'US', size: 'startup' } }),
  ];

  it('returns all leads with default filter', () => {
    expect(selectFilteredLeads(stateWith(leads))).toHaveLength(3);
  });

  it('sorts by score descending (id as tie-breaker)', () => {
    const tied = [makeLead({ id: 'b', score: 50 }), makeLead({ id: 'a', score: 50 }), makeLead({ id: 'c', score: 70 })];
    expect(selectFilteredLeads(stateWith(tied)).map(l => l.id)).toEqual(['c', 'a', 'b']);
  });

  it('filters by search (company name match)', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'acme' } });
    const result = selectFilteredLeads(state);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by search (domain match)', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'widget.io' } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by industry', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, industries: ['Tech'] } });
    expect(selectFilteredLeads(state)).toHaveLength(2);
  });

  it('filters by region', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, regions: ['UK'] } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by stage', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, stages: ['won'] } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by companySize', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, companySizes: ['startup'] } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by scoreMin', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, scoreMin: 70 } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by scoreMax', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, scoreMax: 50 } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('returns empty array when no leads match', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'zzz-no-match' } });
    expect(selectFilteredLeads(state)).toHaveLength(0);
  });

  it('combines multiple filters (AND logic)', () => {
    const state = stateWith(leads, {
      filter: { ...DEFAULT_FILTER, industries: ['Tech'], regions: ['US'], scoreMin: 80 },
    });
    const result = selectFilteredLeads(state);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});

describe('industry / region options and export', () => {
  const leads = [
    makeLead({ id: '1', company: { industry: 'Tech', region: 'US' } }),
    makeLead({ id: '2', company: { industry: 'Tech', region: 'UK' } }),
    makeLead({ id: '3', company: { industry: 'Finance', region: 'US' } }),
    makeLead({ id: '4', company: { industry: null, region: null } }),
  ];

  it('counts leads per industry, largest first, ignoring nulls', () => {
    expect(selectIndustryCounts(stateWith(leads))).toEqual([
      { label: 'Tech', value: 2 },
      { label: 'Finance', value: 1 },
    ]);
  });

  it('lists industry and region options alphabetically', () => {
    expect(selectIndustryOptions(stateWith(leads))).toEqual(['Finance', 'Tech']);
    expect(selectRegionOptions(stateWith(leads))).toEqual(['UK', 'US']);
  });

  it('exports only the selected leads (include mode)', () => {
    const state = stateWith(leads, { selection: { mode: 'include', ids: ['2', '3'] } });
    expect(selectLeadsForExport(state).map(l => l.id).sort()).toEqual(['2', '3']);
  });

  it('exports everything except excluded leads (exclude mode)', () => {
    const state = stateWith(leads, { selection: { mode: 'exclude', ids: ['1'] } });
    expect(selectLeadsForExport(state)).toHaveLength(3);
  });
});

describe('realtime selectors', () => {
  it('exposes lastSeq, connection and the changed id set', () => {
    const state = stateWith([], { lastSeq: 42, connection: 'connected', changedIds: ['a', 'b'] });
    expect(selectLastSeq(state)).toBe(42);
    expect(selectConnection(state)).toBe('connected');
    expect(selectChangedIdSet(state)).toEqual(new Set(['a', 'b']));
  });
});

describe('selectSelectedCount', () => {
  it('include mode: returns ids array length', () => {
    const state = stateWith([], { selection: { mode: 'include', ids: ['a', 'b'] }, totalCount: 10 });
    expect(selectSelectedCount(state)).toBe(2);
  });

  it('exclude mode: returns totalCount minus excluded ids', () => {
    const state = stateWith([], { selection: { mode: 'exclude', ids: ['a'] }, totalCount: 10 });
    expect(selectSelectedCount(state)).toBe(9);
  });

  it('include mode with empty ids: returns 0', () => {
    const state = stateWith([], { selection: { mode: 'include', ids: [] }, totalCount: 10 });
    expect(selectSelectedCount(state)).toBe(0);
  });
});

describe('selectIsAllSelected', () => {
  it('true when mode is exclude and ids is empty', () => {
    const state = stateWith([], { selection: { mode: 'exclude', ids: [] } });
    expect(selectIsAllSelected(state)).toBe(true);
  });

  it('false when mode is exclude but has excluded ids', () => {
    const state = stateWith([], { selection: { mode: 'exclude', ids: ['a'] } });
    expect(selectIsAllSelected(state)).toBe(false);
  });

  it('false when mode is include', () => {
    const state = stateWith([], { selection: { mode: 'include', ids: [] } });
    expect(selectIsAllSelected(state)).toBe(false);
  });
});

describe('selectHasSelection', () => {
  it('true when count > 0', () => {
    const state = stateWith([], { selection: { mode: 'include', ids: ['a'] }, totalCount: 10 });
    expect(selectHasSelection(state)).toBe(true);
  });

  it('false when count is 0', () => {
    const state = stateWith([], { selection: { mode: 'include', ids: [] } });
    expect(selectHasSelection(state)).toBe(false);
  });
});

describe('selectSelectedLead', () => {
  it('returns the lead matching selectedLeadId', () => {
    const lead = makeLead({ id: '1' });
    const state = stateWith([lead], { selectedLeadId: '1' });
    expect(selectSelectedLead(state)?.id).toBe('1');
  });

  it('returns null when selectedLeadId is null', () => {
    const state = stateWith([makeLead()], { selectedLeadId: null });
    expect(selectSelectedLead(state)).toBeNull();
  });

  it('returns null when selectedLeadId does not match any entity', () => {
    const state = stateWith([makeLead({ id: '1' })], { selectedLeadId: 'not-found' });
    expect(selectSelectedLead(state)).toBeNull();
  });
});
