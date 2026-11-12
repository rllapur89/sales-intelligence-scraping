import { leadsReducer } from './leads.reducer';
import { initialLeadsState } from './leads.state';
import { LeadsActions } from './leads.actions';
import { makeBatch, makeLead } from '../../../../testing/factories';

const cached = [makeLead({ id: '1', seq: 4 }), makeLead({ id: '2', seq: 7 })];
const fromCache = () =>
  leadsReducer(initialLeadsState, LeadsActions.loadLeadsFromCache({ leads: cached, lastSeq: 9, savedAt: 5000 }));

describe('leads reducer: offline cache', () => {
  it('hydrates an empty store and stops the loading state', () => {
    const loading = leadsReducer(initialLeadsState, LeadsActions.loadLeads());
    const state = leadsReducer(loading, LeadsActions.loadLeadsFromCache({ leads: cached, lastSeq: 9, savedAt: 5000 }));
    expect(state.ids).toHaveLength(2);
    expect(state.totalCount).toBe(2);
    expect(state.fromCache).toBe(true);
    expect(state.loading).toBe(false);
    expect(state.lastSeq).toBe(9);
    expect(state.lastUpdated).toEqual(new Date(5000));
  });

  it('uses the highest lead seq when it exceeds the stored lastSeq', () => {
    const state = leadsReducer(
      initialLeadsState,
      LeadsActions.loadLeadsFromCache({ leads: cached, lastSeq: 1, savedAt: 1 })
    );
    expect(state.lastSeq).toBe(7);
  });

  it('does not overwrite data that is already in the store', () => {
    const live = leadsReducer(
      initialLeadsState,
      LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'x', seq: 50 })]) })
    );
    const state = leadsReducer(live, LeadsActions.loadLeadsFromCache({ leads: cached, lastSeq: 9, savedAt: 1 }));
    expect(state).toBe(live);
  });

  it('ignores an empty cache', () => {
    const state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsFromCache({ leads: [], lastSeq: 3, savedAt: 1 }));
    expect(state).toBe(initialLeadsState);
  });

  it('the REST snapshot replaces the cached data and clears fromCache', () => {
    const snapshot = [makeLead({ id: '2', seq: 20 }), makeLead({ id: '3', seq: 21 })];
    const state = leadsReducer(fromCache(), LeadsActions.loadLeadsSuccess({ leads: snapshot }));
    expect(state.fromCache).toBe(false);
    expect([...state.ids].sort()).toEqual(['2', '3']);
    expect(state.lastSeq).toBe(21);
  });

  it('a failed snapshot keeps the cached data without an error state', () => {
    const state = leadsReducer(fromCache(), LeadsActions.loadLeadsFailure({ error: 'offline' }));
    expect(state.error).toBeNull();
    expect(state.ids).toHaveLength(2);
    expect(state.loading).toBe(false);
  });

  it('a failed snapshot without a cache still reports the error (unchanged behaviour)', () => {
    const state = leadsReducer(initialLeadsState, LeadsActions.loadLeadsFailure({ error: 'offline' }));
    expect(state.error).toBe('offline');
  });
});
