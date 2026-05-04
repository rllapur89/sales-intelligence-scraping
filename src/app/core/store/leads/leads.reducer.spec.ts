import { leadsReducer } from './leads.reducer';
import { initialLeadsState } from './leads.state';
import { LeadsActions } from './leads.actions';
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

describe('leadsReducer', () => {
  it('initializes with default state', () => {
    const state = leadsReducer(undefined, { type: '@@INIT' } as any);
    expect(state.loading).toBe(false);
    expect(state.error).toBeNull();
    expect(state.ids).toHaveLength(0);
    expect(state.selectedLeadId).toBeNull();
  });

  describe('loadLeads', () => {
    it('sets loading true and clears error', () => {
      const state = leadsReducer(
        { ...initialLeadsState, error: 'old error' },
        LeadsActions.loadLeads()
      );
      expect(state.loading).toBe(true);
      expect(state.error).toBeNull();
    });
  });

  describe('loadLeadsSuccess', () => {
    it('adds all leads, sets loading false and updates totalCount', () => {
      const leads = [makeLead({ id: '1' }), makeLead({ id: '2' })];
      const state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads }));
      expect(state.loading).toBe(false);
      expect(state.ids).toHaveLength(2);
      expect(state.totalCount).toBe(2);
      expect(state.lastUpdated).toBeInstanceOf(Date);
    });
  });

  describe('loadLeadsFailure', () => {
    it('sets error and clears loading', () => {
      const state = leadsReducer(
        { ...initialLeadsState, loading: true },
        LeadsActions.loadLeadsFailure({ error: 'Network error' })
      );
      expect(state.loading).toBe(false);
      expect(state.error).toBe('Network error');
    });
  });

  describe('selectLead', () => {
    it('stores selectedLeadId', () => {
      const state = leadsReducer(initialLeadsState, LeadsActions.selectLead({ id: 'abc' }));
      expect(state.selectedLeadId).toBe('abc');
    });
  });

  describe('deselectLead', () => {
    it('clears selectedLeadId', () => {
      const state = leadsReducer(
        { ...initialLeadsState, selectedLeadId: 'abc' },
        LeadsActions.deselectLead({ id: 'abc' })
      );
      expect(state.selectedLeadId).toBeNull();
    });
  });

  describe('selectAll', () => {
    it('sets mode to exclude with empty ids', () => {
      const state = leadsReducer(initialLeadsState, LeadsActions.selectAll());
      expect(state.selection.mode).toBe('exclude');
      expect(state.selection.ids).toHaveLength(0);
    });
  });

  describe('clearSelection', () => {
    it('resets to include mode with empty ids', () => {
      const withAll = { ...initialLeadsState, selection: { mode: 'exclude' as const, ids: [] } };
      const state = leadsReducer(withAll, LeadsActions.clearSelection());
      expect(state.selection.mode).toBe('include');
      expect(state.selection.ids).toHaveLength(0);
    });
  });

  describe('setFilter', () => {
    it('merges partial filter without touching unrelated fields', () => {
      const state = leadsReducer(
        initialLeadsState,
        LeadsActions.setFilter({ filter: { search: 'john', statuses: ['won'] } })
      );
      expect(state.filter.search).toBe('john');
      expect(state.filter.statuses).toEqual(['won']);
      expect(state.filter.scoreMin).toBe(DEFAULT_FILTER.scoreMin);
    });
  });

  describe('resetFilter', () => {
    it('restores DEFAULT_FILTER', () => {
      const modified = { ...initialLeadsState, filter: { ...DEFAULT_FILTER, search: 'test', scoreMin: 50 } };
      const state = leadsReducer(modified, LeadsActions.resetFilter());
      expect(state.filter.search).toBe('');
      expect(state.filter.scoreMin).toBe(0);
    });
  });

  describe('updateLead', () => {
    it('patches entity in place', () => {
      const lead = makeLead({ id: '1', status: 'new' });
      const withLead = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads: [lead] }));
      const state = leadsReducer(
        withLead,
        LeadsActions.updateLead({ lead: { ...lead, status: 'won' } })
      );
      expect((state.entities as any)['1'].status).toBe('won');
    });
  });

  describe('deleteLead', () => {
    it('removes entity from state', () => {
      const lead = makeLead({ id: '1' });
      const withLead = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads: [lead] }));
      const state = leadsReducer(withLead, LeadsActions.deleteLead({ id: '1' }));
      expect(state.ids).toHaveLength(0);
      expect(state.entities['1']).toBeUndefined();
    });
  });

  describe('refreshLeadScraping', () => {
    it('adds id to rescrapingIds', () => {
      const state = leadsReducer(initialLeadsState, LeadsActions.refreshLeadScraping({ id: 'abc' }));
      expect(state.rescrapingIds).toContain('abc');
    });

    it('does not duplicate id in rescrapingIds', () => {
      const s1 = leadsReducer(initialLeadsState, LeadsActions.refreshLeadScraping({ id: 'abc' }));
      const s2 = leadsReducer(s1, LeadsActions.refreshLeadScraping({ id: 'abc' }));
      expect(s2.rescrapingIds.filter(id => id === 'abc')).toHaveLength(1);
    });
  });

  describe('refreshLeadScrapingSuccess', () => {
    it('removes id from rescrapingIds and updates lead', () => {
      const lead = makeLead({ id: '1', scrapingStatus: 'stale' });
      const withLead = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads: [lead] }));
      const withScraping = leadsReducer(withLead, LeadsActions.refreshLeadScraping({ id: '1' }));
      const updatedLead = { ...lead, scrapingStatus: 'updated' as const };
      const state = leadsReducer(withScraping, LeadsActions.refreshLeadScrapingSuccess({ lead: updatedLead }));
      expect(state.rescrapingIds).not.toContain('1');
      expect((state.entities as any)['1'].scrapingStatus).toBe('updated');
    });
  });

  describe('addLead', () => {
    it('adds lead and increments totalCount', () => {
      const lead = makeLead({ id: 'new-1' });
      const state = leadsReducer(initialLeadsState, LeadsActions.addLead({ lead }));
      expect(state.ids).toContain('new-1');
      expect(state.totalCount).toBe(1);
    });
  });
});
