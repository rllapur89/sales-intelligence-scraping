import { leadsReducer } from './leads.reducer';
import { initialLeadsState } from './leads.state';
import { LeadsActions } from './leads.actions';
import { appendChangedIds, maxSeq, mergeSnapshot, pickFreshLeads } from './leads.batch';
import { makeBatch, makeLead } from '../../../../testing/factories';

describe('leads reducer: realtime', () => {
  describe('updateLeadSuccess / updateLeadFailure', () => {
    it('failure restores the previous version', () => {
      const lead = makeLead({ id: '1', stage: 'new' });
      let state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads: [lead] }));
      state = leadsReducer(state, LeadsActions.updateLead({ lead: { ...lead, stage: 'won' }, previous: lead }));
      expect(state.entities['1']?.stage).toBe('won');
      state = leadsReducer(state, LeadsActions.updateLeadFailure({ previous: lead, error: 'boom' }));
      expect(state.entities['1']?.stage).toBe('new');
    });

    it('success stores the server version', () => {
      const lead = makeLead({ id: '1' });
      let state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads: [lead] }));
      state = leadsReducer(state, LeadsActions.updateLeadSuccess({ lead: { ...lead, updatedAt: 'later' } }));
      expect(state.entities['1']?.updatedAt).toBe('later');
    });
  });

  describe('refreshLeadScrapingFailure', () => {
    it('clears the rescraping flag', () => {
      const s1 = leadsReducer(initialLeadsState, LeadsActions.refreshLeadScraping({ id: 'abc' }));
      const s2 = leadsReducer(s1, LeadsActions.refreshLeadScrapingFailure({ id: 'abc', error: 'x' }));
      expect(s2.rescrapingIds).not.toContain('abc');
    });
  });

  describe('loadLeadsSuccess + lastSeq', () => {
    it('sets lastSeq to the highest seq of the snapshot', () => {
      const leads = [makeLead({ id: '1', seq: 5 }), makeLead({ id: '2', seq: 9 }), makeLead({ id: '3', seq: 7 })];
      const state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads }));
      expect(state.lastSeq).toBe(9);
    });

    it('keeps versions that arrived over the socket while the snapshot was loading', () => {
      const live = makeLead({ id: '1', seq: 20, score: 99 });
      let state = leadsReducer(initialLeadsState, LeadsActions.upsertBatch({ batch: makeBatch([live]) }));
      const snapshot = [makeLead({ id: '1', seq: 10, score: 1 }), makeLead({ id: '2', seq: 11 })];
      state = leadsReducer(state, LeadsActions.loadLeadsSuccess({ leads: snapshot }));
      expect(state.entities['1']?.score).toBe(99);
      expect(state.ids).toHaveLength(2);
      expect(state.lastSeq).toBe(20);
    });

    it('drops held leads that are older than the snapshot and missing from it', () => {
      let state = leadsReducer(
        initialLeadsState,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'gone', seq: 2 })]) })
      );
      state = leadsReducer(state, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 50 })] }));
      expect(state.ids).toEqual(['a']);
    });
  });

  describe('upsertBatch (seq guard)', () => {
    it('adds new leads, advances lastSeq and totalCount, marks changed ids', () => {
      const batch = makeBatch([makeLead({ id: '1', seq: 3 }), makeLead({ id: '2', seq: 4 })], 3, 4);
      const state = leadsReducer(initialLeadsState, LeadsActions.upsertBatch({ batch, origin: 'live' }));
      expect(state.ids).toHaveLength(2);
      expect(state.totalCount).toBe(2);
      expect(state.lastSeq).toBe(4);
      expect(state.changedIds).toEqual(['1', '2']);
    });

    it('applies a newer version of a held lead', () => {
      let state = leadsReducer(
        initialLeadsState,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 3, score: 10 })]) })
      );
      state = leadsReducer(
        state,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 8, score: 70 })]) })
      );
      expect(state.entities['1']?.score).toBe(70);
      expect(state.entities['1']?.seq).toBe(8);
      expect(state.lastSeq).toBe(8);
    });

    it('ignores stale and equal versions but still advances lastSeq to toSeq', () => {
      let state = leadsReducer(
        initialLeadsState,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 10, score: 70 })]) })
      );
      const stale = makeBatch([makeLead({ id: '1', seq: 4, score: 5 })], 4, 4);
      const equal = makeBatch([makeLead({ id: '1', seq: 10, score: 6 })], 10, 12);
      state = leadsReducer(state, LeadsActions.upsertBatch({ batch: stale }));
      expect(state.entities['1']?.score).toBe(70);
      expect(state.lastSeq).toBe(10);
      state = leadsReducer(state, LeadsActions.upsertBatch({ batch: equal }));
      expect(state.entities['1']?.score).toBe(70);
      expect(state.lastSeq).toBe(12);
    });

    it('never moves lastSeq backwards', () => {
      let state = leadsReducer(
        initialLeadsState,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 50 })]) })
      );
      state = leadsReducer(
        state,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '2', seq: 5 })], 5, 5) })
      );
      expect(state.lastSeq).toBe(50);
      expect(state.entities['2']).toBeDefined();
    });

    it('keeps only the highest seq when a batch repeats a lead', () => {
      const batch = makeBatch([
        makeLead({ id: '1', seq: 9, score: 90 }),
        makeLead({ id: '1', seq: 7, score: 70 }),
      ]);
      const state = leadsReducer(initialLeadsState, LeadsActions.upsertBatch({ batch }));
      expect(state.ids).toHaveLength(1);
      expect(state.entities['1']?.score).toBe(90);
    });

    it('returns the same state when nothing changes', () => {
      const first = leadsReducer(
        initialLeadsState,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 5 })]) })
      );
      const second = leadsReducer(
        first,
        LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: '1', seq: 5 })], 5, 5) })
      );
      expect(second).toBe(first);
    });

    it('applies a batch of 1000 leads in one reduction', () => {
      const leads = Array.from({ length: 1000 }, (_, i) => makeLead({ id: 'l' + i, seq: i + 1 }));
      const state = leadsReducer(initialLeadsState, LeadsActions.upsertBatch({ batch: makeBatch(leads) }));
      expect(state.ids).toHaveLength(1000);
      expect(state.totalCount).toBe(1000);
      expect(state.lastSeq).toBe(1000);
      expect(state.changedIds).toHaveLength(1000);
      // The same batch again is entirely stale.
      const again = leadsReducer(state, LeadsActions.upsertBatch({ batch: makeBatch(leads) }));
      expect(again).toBe(state);
    });

    it('caps the changed ids kept for highlighting', () => {
      const leads = Array.from({ length: 2500 }, (_, i) => makeLead({ id: 'l' + i, seq: i + 1 }));
      const state = leadsReducer(initialLeadsState, LeadsActions.upsertBatch({ batch: makeBatch(leads) }));
      expect(state.changedIds).toHaveLength(2000);
      expect(state.changedIds.at(-1)).toBe('l2499');
    });
  });

  describe('resync / connection / highlight', () => {
    it('resetSeq sets lastSeq (full resync)', () => {
      const state = leadsReducer({ ...initialLeadsState, lastSeq: 3 }, LeadsActions.resetSeq({ lastSeq: 900 }));
      expect(state.lastSeq).toBe(900);
    });

    it('setConnection stores the status and keeps the state when unchanged', () => {
      const connected = leadsReducer(initialLeadsState, LeadsActions.setConnection({ status: 'connected' }));
      expect(connected.connection).toBe('connected');
      expect(leadsReducer(connected, LeadsActions.setConnection({ status: 'connected' }))).toBe(connected);
    });

    it('clearChanged empties changedIds', () => {
      const state = leadsReducer({ ...initialLeadsState, changedIds: ['a'] }, LeadsActions.clearChanged());
      expect(state.changedIds).toEqual([]);
    });
  });
});

describe('leads.batch helpers', () => {
  it('pickFreshLeads only returns strictly newer leads', () => {
    const held = { a: makeLead({ id: 'a', seq: 5 }) };
    const fresh = pickFreshLeads(held, [
      makeLead({ id: 'a', seq: 5 }),
      makeLead({ id: 'a', seq: 4 }),
      makeLead({ id: 'b', seq: 1 }),
    ]);
    expect(fresh.map(l => l.id)).toEqual(['b']);
  });

  it('mergeSnapshot prefers the newer version of each lead', () => {
    const held = { a: makeLead({ id: 'a', seq: 9, score: 9 }), b: makeLead({ id: 'b', seq: 1, score: 1 }) };
    const merged = mergeSnapshot(held, [makeLead({ id: 'a', seq: 5, score: 5 }), makeLead({ id: 'b', seq: 3, score: 3 })]);
    expect(merged.find(l => l.id === 'a')?.score).toBe(9);
    expect(merged.find(l => l.id === 'b')?.score).toBe(3);
  });

  it('maxSeq is 0 for an empty list', () => {
    expect(maxSeq([])).toBe(0);
    expect(maxSeq([makeLead({ seq: 3 }), makeLead({ id: 'x', seq: 8 })])).toBe(8);
  });

  it('appendChangedIds de-duplicates', () => {
    expect(appendChangedIds(['a', 'b'], ['b', 'c'])).toEqual(['a', 'b', 'c']);
  });
});
