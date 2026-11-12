import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action, Store, provideStore } from '@ngrx/store';
import { Observable, Subject, Subscription, of, throwError } from 'rxjs';
import { LeadsEffects } from './leads.effects';
import { leadsReducer } from './leads.reducer';
import { LeadsActions } from './leads.actions';
import { LeadsDataSource } from '../../data/leads.data-source';
import { DATA_MODE, ENVIRONMENT } from '../../config/app-environment';
import { RealtimeService } from '../../realtime/realtime.service';
import { ToastService } from '../../../shared/services/toast.service';
import { AuthService } from '../../auth/auth.service';
import { SNAPSHOT_STORAGE, MemorySnapshotStorage } from '../../cache/snapshot-storage';
import { Snapshot } from '../../cache/snapshot.helpers';
import { environment } from '../../../../environments/environment';
import type { DataMode } from '../../../../environments/environment.model';
import { makeBatch, makeLead } from '../../../../testing/factories';

const DEBOUNCE = 5000;

interface Setup {
  effects: LeadsEffects;
  actions$: Subject<Action>;
  storage: MemorySnapshotStorage;
  store: Store;
  toast: { show: ReturnType<typeof vi.fn> };
  auth: { isAuthenticated: ReturnType<typeof vi.fn> };
  dispatched: Action[];
  subs: Subscription;
}

function setup(mode: DataMode, loadSnapshot: () => Observable<unknown> = () => of([])): Setup {
  const actions$ = new Subject<Action>();
  const storage = new MemorySnapshotStorage();
  const toast = { show: vi.fn() };
  const auth = { isAuthenticated: vi.fn(() => true) };
  TestBed.configureTestingModule({
    providers: [
      LeadsEffects,
      provideStore({ leads: leadsReducer }),
      { provide: Actions, useValue: new Actions(actions$) },
      { provide: LeadsDataSource, useValue: { loadSnapshot } },
      { provide: RealtimeService, useValue: { resyncAfterSnapshot: vi.fn(), sendAcks: vi.fn() } },
      { provide: ToastService, useValue: toast },
      { provide: AuthService, useValue: auth },
      { provide: DATA_MODE, useValue: mode },
      { provide: ENVIRONMENT, useValue: { ...environment, dataMode: mode, snapshotSaveDebounceMs: DEBOUNCE } },
      { provide: SNAPSHOT_STORAGE, useValue: storage },
    ],
  });
  const effects = TestBed.inject(LeadsEffects);
  const store = TestBed.inject(Store);
  const dispatched: Action[] = [];
  const subs = new Subscription();
  // Mirror the real runtime: effect output goes through the store, and also back into `actions$`.
  const feed = (a: Action) => {
    store.dispatch(a);
    actions$.next(a);
  };
  subs.add(effects.hydrateFromCache$.subscribe(a => (dispatched.push(a), feed(a))));
  subs.add(effects.offlineFallbackToast$.subscribe());
  subs.add(effects.saveSnapshot$.subscribe());
  // Expose `feed` through actions$ users: tests call `emit`.
  (actions$ as unknown as { feed: typeof feed }).feed = feed;
  return { effects, actions$, storage, store, toast, auth, dispatched, subs };
}

const emit = (s: Setup, a: Action) => (s.actions$ as unknown as { feed: (a: Action) => void }).feed(a);

const cachedSnapshot = (): Snapshot => ({
  version: 1,
  savedAt: Date.now(),
  lastSeq: 12,
  leads: [makeLead({ id: 'c1', seq: 10 }), makeLead({ id: 'c2', seq: 12 })],
});

describe('LeadsEffects: offline cache', () => {
  let s: Setup;

  afterEach(() => {
    s?.subs.unsubscribe();
    vi.useRealTimers();
    TestBed.resetTestingModule();
  });

  describe('hydrateFromCache$', () => {
    it('live: dispatches loadLeadsFromCache with the cached snapshot on loadLeads', async () => {
      s = setup('live');
      const snap = cachedSnapshot();
      await s.storage.put(snap);
      emit(s, LeadsActions.loadLeads());
      await vi.waitFor(() => expect(s.dispatched).toHaveLength(1));
      expect(s.dispatched[0]).toEqual(
        LeadsActions.loadLeadsFromCache({ leads: snap.leads, lastSeq: 12, savedAt: snap.savedAt })
      );
    });

    it('live: the store shows the cached leads', async () => {
      s = setup('live');
      await s.storage.put(cachedSnapshot());
      emit(s, LeadsActions.loadLeads());
      await vi.waitFor(() => expect(s.dispatched).toHaveLength(1));
      let count = 0;
      s.store.select(st => (st as { leads: { ids: unknown[] } }).leads.ids.length).subscribe(n => (count = n));
      expect(count).toBe(2);
    });

    it('live: dispatches nothing when there is no cache', async () => {
      s = setup('live');
      emit(s, LeadsActions.loadLeads());
      await new Promise(r => setTimeout(r, 10));
      expect(s.dispatched).toHaveLength(0);
    });

    it('live: ignores and clears an expired cache', async () => {
      s = setup('live');
      await s.storage.put({ ...cachedSnapshot(), savedAt: Date.now() - 8 * 24 * 3600 * 1000 });
      emit(s, LeadsActions.loadLeads());
      await vi.waitFor(async () => expect(await s.storage.get()).toBeNull());
      expect(s.dispatched).toHaveLength(0);
    });

    it('live: ignores a corrupt cache', async () => {
      s = setup('live');
      await s.storage.put({ version: 1, savedAt: Date.now(), lastSeq: 1, leads: [{ nope: true }] } as unknown as Snapshot);
      emit(s, LeadsActions.loadLeads());
      await vi.waitFor(async () => expect(await s.storage.get()).toBeNull());
      expect(s.dispatched).toHaveLength(0);
    });

    it('live: drops the cache read if the REST snapshot answered first', async () => {
      s = setup('live');
      await s.storage.put(cachedSnapshot());
      emit(s, LeadsActions.loadLeads());
      s.actions$.next(LeadsActions.loadLeadsSuccess({ leads: [] }));
      await new Promise(r => setTimeout(r, 10));
      expect(s.dispatched).toHaveLength(0);
    });

    it('mock: never reads the cache', async () => {
      s = setup('mock');
      await s.storage.put(cachedSnapshot());
      emit(s, LeadsActions.loadLeads());
      await new Promise(r => setTimeout(r, 10));
      expect(s.dispatched).toHaveLength(0);
    });
  });

  describe('offlineFallbackToast$', () => {
    it('shows the toast when the snapshot fails while cached data is displayed', async () => {
      s = setup('live');
      await s.storage.put(cachedSnapshot());
      emit(s, LeadsActions.loadLeads());
      await vi.waitFor(() => expect(s.dispatched).toHaveLength(1));
      emit(s, LeadsActions.loadLeadsFailure({ error: 'offline' }));
      expect(s.toast.show).toHaveBeenCalledWith('info', 'Offline: showing the last saved data');
    });

    it('shows no toast when there is no cached data (plain error state)', () => {
      s = setup('live');
      emit(s, LeadsActions.loadLeadsFailure({ error: 'offline' }));
      expect(s.toast.show).not.toHaveBeenCalled();
    });

    it('mock: shows no toast', () => {
      s = setup('mock');
      emit(s, LeadsActions.loadLeadsFailure({ error: 'x' }));
      expect(s.toast.show).not.toHaveBeenCalled();
    });
  });

  describe('saveSnapshot$', () => {
    it('live: saves the leads and lastSeq right after loadLeadsSuccess', async () => {
      s = setup('live');
      emit(s, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 3 }), makeLead({ id: 'b', seq: 8 })] }));
      await vi.waitFor(async () => expect(await s.storage.get()).not.toBeNull());
      const saved = (await s.storage.get())!;
      expect(saved.version).toBe(1);
      expect(saved.lastSeq).toBe(8);
      expect(saved.leads.map(l => l.id).sort()).toEqual(['a', 'b']);
    });

    it('live: debounces live batches and saves once after they settle', async () => {
      s = setup('live');
      const put = vi.spyOn(s.storage, 'put');
      vi.useFakeTimers();
      emit(s, LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'a', seq: 5 })]) }));
      await vi.advanceTimersByTimeAsync(DEBOUNCE - 1000);
      emit(s, LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'b', seq: 6 })]) }));
      await vi.advanceTimersByTimeAsync(DEBOUNCE - 1);
      expect(put).not.toHaveBeenCalled();
      await vi.advanceTimersByTimeAsync(1);
      expect(put).toHaveBeenCalledTimes(1);
      const saved = put.mock.calls[0][0];
      expect(saved.lastSeq).toBe(6);
      expect(saved.leads.map(l => l.id).sort()).toEqual(['a', 'b']);
    });

    it('live: caps the saved leads to snapshotMaxLeads, keeping the best scores', async () => {
      s = setup('live');
      const env = TestBed.inject(ENVIRONMENT) as { snapshotMaxLeads: number };
      env.snapshotMaxLeads = 2;
      emit(
        s,
        LeadsActions.loadLeadsSuccess({
          leads: [
            makeLead({ id: 'lo', score: 5 }),
            makeLead({ id: 'hi', score: 95 }),
            makeLead({ id: 'mid', score: 50 }),
          ],
        })
      );
      await vi.waitFor(async () => expect(await s.storage.get()).not.toBeNull());
      expect((await s.storage.get())!.leads.map(l => l.id).sort()).toEqual(['hi', 'mid']);
    });

    it('live: does not save when the session has ended', async () => {
      s = setup('live');
      s.auth.isAuthenticated.mockReturnValue(false);
      const put = vi.spyOn(s.storage, 'put');
      emit(s, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a' })] }));
      await new Promise(r => setTimeout(r, 10));
      expect(put).not.toHaveBeenCalled();
    });

    it('mock: never saves', async () => {
      s = setup('mock');
      const put = vi.spyOn(s.storage, 'put');
      emit(s, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a' })] }));
      await new Promise(r => setTimeout(r, 10));
      expect(put).not.toHaveBeenCalled();
    });

    it('a failing storage never breaks the stream', async () => {
      s = setup('live');
      vi.spyOn(s.storage, 'put').mockRejectedValue(new Error('quota'));
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
      emit(s, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a' })] }));
      await new Promise(r => setTimeout(r, 10));
      emit(s, LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'b' })] }));
      expect(warn).toHaveBeenCalled();
      warn.mockRestore();
    });
  });

  it('keeps loadLeads$ behaviour: a failing REST snapshot maps to loadLeadsFailure', async () => {
    s = setup('live', () => throwError(() => new Error('down')));
    const out: Action[] = [];
    s.subs.add(s.effects.loadLeads$.subscribe(a => out.push(a)));
    s.actions$.next(LeadsActions.loadLeads());
    expect(out).toHaveLength(1);
    expect(out[0].type).toBe(LeadsActions.loadLeadsFailure.type);
  });
});
