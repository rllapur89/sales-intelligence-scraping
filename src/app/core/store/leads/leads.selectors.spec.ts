import { leadsAdapter, initialLeadsState, LeadsState } from './leads.state';
import {
  selectFilteredLeads,
  selectSelectedCount,
  selectIsAllSelected,
  selectHasSelection,
  selectSelectedLead,
} from './leads.selectors';
import { Lead, DEFAULT_FILTER } from '../../models/lead.model';

function makeLead(overrides: Partial<Lead> = {}): Lead {
  return {
    id: 'lead-1',
    firstName: 'John',
    lastName: 'Doe',
    email: 'john@example.com',
    company: 'Acme',
    companySize: 'smb',
    industry: 'Tech',
    country: 'US',
    city: 'NYC',
    role: 'CTO',
    seniority: 'c-level',
    score: 80,
    status: 'new',
    scrapingStatus: 'updated',
    estimatedValue: 5000,
    lastScraped: new Date('2024-01-01'),
    createdAt: new Date('2024-01-01'),
    tags: [],
    ...overrides,
  };
}

function stateWith(leads: Lead[], partial: Partial<LeadsState> = {}): { leads: LeadsState } {
  const entityState = leadsAdapter.setAll(leads, initialLeadsState);
  return { leads: { ...entityState, ...partial } };
}

describe('selectFilteredLeads', () => {
  const leads = [
    makeLead({ id: '1', firstName: 'Alice', lastName: 'Smith', company: 'Acme', email: 'alice@acme.com', industry: 'Tech', country: 'US', score: 90, status: 'new', companySize: 'smb' }),
    makeLead({ id: '2', firstName: 'Bob', lastName: 'Jones', company: 'WidgetCo', email: 'bob@widget.com', industry: 'Finance', country: 'UK', score: 40, status: 'won', companySize: 'enterprise' }),
    makeLead({ id: '3', firstName: 'Charlie', lastName: 'Brown', company: 'StartupXYZ', email: 'charlie@test.com', industry: 'Tech', country: 'US', score: 60, status: 'contacted', companySize: 'startup' }),
  ];

  it('returns all leads with default filter', () => {
    expect(selectFilteredLeads(stateWith(leads))).toHaveLength(3);
  });

  it('filters by search (firstName match)', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'alice' } });
    const result = selectFilteredLeads(state);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });

  it('filters by search (company match)', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'widgetco' } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by search (email match)', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'charlie@test' } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by industry', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, industries: ['Tech'] } });
    expect(selectFilteredLeads(state)).toHaveLength(2);
  });

  it('filters by country', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, countries: ['UK'] } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('filters by status', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, statuses: ['won'] } });
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

  it('filters by assignedTo', () => {
    const leadsWithAssignment = [
      makeLead({ id: '1', assignedTo: 'agent-a' }),
      makeLead({ id: '2', assignedTo: 'agent-b' }),
    ];
    const state = stateWith(leadsWithAssignment, { filter: { ...DEFAULT_FILTER, assignedTo: 'agent-a' } });
    expect(selectFilteredLeads(state)).toHaveLength(1);
  });

  it('returns empty array when no leads match', () => {
    const state = stateWith(leads, { filter: { ...DEFAULT_FILTER, search: 'zzz-no-match' } });
    expect(selectFilteredLeads(state)).toHaveLength(0);
  });

  it('combines multiple filters (AND logic)', () => {
    const state = stateWith(leads, {
      filter: { ...DEFAULT_FILTER, industries: ['Tech'], countries: ['US'], scoreMin: 80 },
    });
    const result = selectFilteredLeads(state);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
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
