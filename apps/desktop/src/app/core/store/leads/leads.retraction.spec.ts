import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action, Store, provideStore } from '@ngrx/store';
import { Subject, Subscription } from 'rxjs';
import { LeadsEffects } from './leads.effects';
import { leadsReducer } from './leads.reducer';
import { LeadsActions } from './leads.actions';
import { initialLeadsState } from './leads.state';
import { retractableIds } from './leads.batch';
import { selectAllLeads, selectSelectedLead } from './leads.selectors';
import { LeadsDataSource } from '../../data/leads.data-source';
import { DATA_MODE, ENVIRONMENT } from '../../config/app-environment';
import { RealtimeService } from '../../realtime/realtime.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AuthService } from '../../auth/auth.service';
import { SnapshotCache } from '../../cache/snapshot-cache.service';
import { environment } from '../../../../environments/environment';
import { makeBatch, makeLead } from '../../../../testing/factories';

function withLeads(...leads: ReturnType<typeof makeLead>[]) {
  return leadsReducer(initialLeadsState, LeadsActions.loadLeadsSuccess({ leads }));
}

describe('retractableIds', () => {
  const held = { a: makeLead({ id: 'a', seq: 5 }), b: makeLead({ id: 'b', seq: 9 }) };

  it('keeps held leads that are not newer than the retraction', () => {
    expect(retractableIds(held, ['a'], 5)).toEqual(['a']);
    expect(retractableIds(held, ['a'], 7)).toEqual(['a']);
  });

  it('skips unknown ids and leads newer than the retraction (stale)', () => {
    expect(retractableIds(held, ['a', 'b', 'zzz'], 6)).toEqual(['a']);
  });

  it('returns nothing for an empty request', () => {
    expect(retractableIds(held, [], 100)).toEqual([]);
  });
});

describe('leads reducer: retractLeads', () => {
  it('removes the retracted leads, recounts and advances lastSeq', () => {
    const state = withLeads(
      makeLead({ id: 'a', seq: 1 }),
      makeLead({ id: 'b', seq: 2 }),
      makeLead({ id: 'c', seq: 3 })
    );
    const next = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['a', 'c'], seq: 10 }));
    expect(next.ids).toEqual(['b']);
    expect(next.totalCount).toBe(1);
    expect(next.lastSeq).toBe(10);
  });

  it('does not flash removed rows but keeps the other flashing rows', () => {
    let state = withLeads(makeLead({ id: 'a', seq: 1 }), makeLead({ id: 'b', seq: 1 }));
    state = leadsReducer(
      state,
      LeadsActions.upsertBatch({
        batch: makeBatch([makeLead({ id: 'a', seq: 2 }), makeLead({ id: 'b', seq: 2 })]),
      })
    );
    expect(state.changedIds).toEqual(['a', 'b']);
    state = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['a'], seq: 3 }));
    expect(state.changedIds).toEqual(['b']);
  });

  it('drops retracted leads from the bulk selection', () => {
    let state = withLeads(makeLead({ id: 'a' }), makeLead({ id: 'b' }));
    state = leadsReducer(state, LeadsActions.toggleLeadSelection({ id: 'a' }));
    state = leadsReducer(state, LeadsActions.toggleLeadSelection({ id: 'b' }));
    state = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['a'], seq: 5 }));
    expect(state.selection).toEqual({ mode: 'include', ids: ['b'] });
  });

  it('ignores unknown ids but still advances lastSeq', () => {
    const state = withLeads(makeLead({ id: 'a', seq: 1 }));
    const next = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['nope'], seq: 7 }));
    expect(next.ids).toEqual(['a']);
    expect(next.lastSeq).toBe(7);
  });

  it('returns the same state when nothing changes', () => {
    const state = withLeads(makeLead({ id: 'a', seq: 8 }));
    expect(leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['nope'], seq: 3 }))).toBe(state);
  });

  it('does not remove a lead that is newer than the retraction', () => {
    const state = withLeads(makeLead({ id: 'a', seq: 20 }));
    const next = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['a'], seq: 10 }));
    expect(next.ids).toEqual(['a']);
    expect(next.lastSeq).toBe(20);
  });

  it('a retracted lead can come back through a later batch', () => {
    let state = withLeads(makeLead({ id: 'a', seq: 1 }));
    state = leadsReducer(state, LeadsActions.retractLeads({ leadIds: ['a'], seq: 2 }));
    state = leadsReducer(state, LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'a', seq: 3 })]) }));
    expect(state.ids).toEqual(['a']);
  });
});

describe('LeadsEffects: retractedSelection$', () => {
  let actions$: Subject<Action>;
  let store: Store;
  let toast: { show: ReturnType<typeof vi.fn> };
  let effects: LeadsEffects;
  let subs: Subscription;
  let emitted: Action[];

  beforeEach(() => {
    actions$ = new Subject<Action>();
    toast = { show: vi.fn() };
    TestBed.configureTestingModule({
      providers: [
        LeadsEffects,
        provideStore({ leads: leadsReducer }),
        { provide: Actions, useValue: new Actions(actions$) },
        { provide: LeadsDataSource, useValue: {} },
        { provide: RealtimeService, useValue: {} },
        { provide: ToastService, useValue: toast },
        { provide: AuthService, useValue: {} },
        { provide: SnapshotCache, useValue: {} },
        { provide: DATA_MODE, useValue: 'live' },
        { provide: ENVIRONMENT, useValue: { ...environment, dataMode: 'live' } },
      ],
    });
    store = TestBed.inject(Store);
    effects = TestBed.inject(LeadsEffects);
    emitted = [];
    subs = new Subscription();
    // Same wiring as the runtime: the action reaches the reducers, then the effects.
    subs.add(
      effects.retractedSelection$.subscribe(a => {
        emitted.push(a);
        store.dispatch(a);
      })
    );
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 1 }), makeLead({ id: 'b', seq: 1 })] }));
  });

  afterEach(() => subs.unsubscribe());

  const retract = (leadIds: string[], seq = 5) => {
    const action = LeadsActions.retractLeads({ leadIds, seq });
    store.dispatch(action);
    actions$.next(action);
  };
  const leads = () => {
    let out: unknown[] = [];
    store.select(selectAllLeads).subscribe(l => (out = l)).unsubscribe();
    return out.length;
  };
  const selected = () => {
    let out: unknown = 'unset';
    store.select(selectSelectedLead).subscribe(l => (out = l)).unsubscribe();
    return out;
  };

  it('clears the selection and shows a toast when the selected lead is retracted', () => {
    store.dispatch(LeadsActions.selectLead({ id: 'a' }));
    retract(['a']);
    expect(leads()).toBe(1);
    expect(selected()).toBeNull();
    expect(emitted).toEqual([LeadsActions.deselectLead({ id: 'a' })]);
    expect(toast.show).toHaveBeenCalledTimes(1);
    expect(toast.show).toHaveBeenCalledWith('info', 'Lead removed', 'It no longer matches your subscriptions.');
  });

  it('keeps the selection and shows nothing when another lead is retracted', () => {
    store.dispatch(LeadsActions.selectLead({ id: 'b' }));
    retract(['a']);
    expect(selected()).toMatchObject({ id: 'b' });
    expect(emitted).toEqual([]);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('does nothing when no lead is selected', () => {
    retract(['a']);
    expect(emitted).toEqual([]);
    expect(toast.show).not.toHaveBeenCalled();
  });

  it('does not clear the selection when the retraction was stale', () => {
    store.dispatch(LeadsActions.selectLead({ id: 'a' }));
    retract(['a'], 0);
    expect(selected()).toMatchObject({ id: 'a' });
    expect(toast.show).not.toHaveBeenCalled();
  });
});
