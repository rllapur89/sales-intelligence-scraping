import { TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { of, throwError } from 'rxjs';
import type { LatencyAck, LeadBatch, ResyncRequest, ResyncResponse } from '@leads/shared';
import { RealtimeService, RealtimeSocket, SOCKET_FACTORY, UNAUTHORIZED } from './realtime.service';
import { AuthService } from '../auth/auth.service';
import { ENVIRONMENT } from '../config/app-environment';
import { environment } from '../../../environments/environment';
import { leadsReducer } from '../store/leads/leads.reducer';
import { LeadsActions } from '../store/leads/leads.actions';
import { selectLastSeq, selectAllLeads } from '../store/leads/leads.selectors';
import { makeBatch, makeLead } from '../../../testing/factories';

type Handler = (...args: never[]) => void;

class FakeSocket implements RealtimeSocket {
  connected = false;
  readonly handlers = new Map<string, Handler[]>();
  readonly ioHandlers = new Map<string, Handler[]>();
  readonly emitted: { event: string; payload: unknown }[] = [];
  resyncAck: ((res: ResyncResponse) => void) | null = null;
  connectCalls = 0;
  disconnectCalls = 0;

  readonly io = {
    on: (event: string, cb: () => void) => {
      this.ioHandlers.set(event, [...(this.ioHandlers.get(event) ?? []), cb as Handler]);
    },
  };

  connect(): void {
    this.connectCalls++;
  }
  disconnect(): void {
    this.disconnectCalls++;
    this.connected = false;
  }

  on(event: string, cb: Handler): void {
    this.handlers.set(event, [...(this.handlers.get(event) ?? []), cb]);
  }

  emit(event: string, payload: ResyncRequest | LatencyAck[], ack?: (res: ResyncResponse) => void): void {
    this.emitted.push({ event, payload });
    if (event === 'leads:resync' && ack) this.resyncAck = ack;
  }

  // ---- test helpers
  fire(event: string, ...args: unknown[]): void {
    for (const h of this.handlers.get(event) ?? []) (h as (...a: unknown[]) => void)(...args);
  }
  fireIo(event: string): void {
    for (const h of this.ioHandlers.get(event) ?? []) h();
  }
  serverConnects(): void {
    this.connected = true;
    this.fire('connect');
  }
  resyncRequests(): ResyncRequest[] {
    return this.emitted.filter(e => e.event === 'leads:resync').map(e => e.payload as ResyncRequest);
  }
}

describe('RealtimeService', () => {
  let socket: FakeSocket;
  let service: RealtimeService;
  let store: Store;
  let auth: {
    ensureToken: ReturnType<typeof vi.fn>;
    refresh: ReturnType<typeof vi.fn>;
    accessToken: ReturnType<typeof vi.fn>;
  };
  let factoryCalls: { url: string; token: string | null }[];

  function setup(): void {
    socket = new FakeSocket();
    factoryCalls = [];
    auth = {
      ensureToken: vi.fn(() => of('token-1')),
      refresh: vi.fn(() => of({ accessToken: 'token-2' })),
      accessToken: vi.fn(() => 'token-1'),
    };
    TestBed.configureTestingModule({
      providers: [
        provideStore({ leads: leadsReducer }),
        { provide: AuthService, useValue: auth },
        { provide: ENVIRONMENT, useValue: { ...environment, dataMode: 'live', socketUrl: 'http://api.test' } },
        {
          provide: SOCKET_FACTORY,
          useValue: (url: string, getToken: () => string | null) => {
            factoryCalls.push({ url, token: getToken() });
            return socket;
          },
        },
      ],
    });
    store = TestBed.inject(Store);
    service = TestBed.inject(RealtimeService);
  }

  beforeEach(() => setup());

  it('connects to the socket url with the current token and reports connecting', () => {
    service.start();
    expect(factoryCalls).toEqual([{ url: 'http://api.test', token: 'token-1' }]);
    expect(socket.connectCalls).toBe(1);
    expect(service.status()).toBe('connecting');
  });

  it('start() twice opens one socket', () => {
    service.start();
    service.start();
    expect(factoryCalls).toHaveLength(1);
  });

  it('is unauthorized when no token can be obtained', () => {
    auth.ensureToken.mockReturnValue(throwError(() => new Error('401')));
    service.start();
    expect(service.status()).toBe('unauthorized');
    expect(factoryCalls).toHaveLength(0);
  });

  it('mirrors status transitions into the store', () => {
    service.start();
    socket.serverConnects();
    expect(service.status()).toBe('connected');
    let connection = '';
    store.select(s => (s as { leads: { connection: string } }).leads.connection).subscribe(c => (connection = c)).unsubscribe();
    expect(connection).toBe('connected');

    socket.connected = false;
    socket.fire('disconnect', 'transport close');
    expect(service.status()).toBe('reconnecting');
    socket.fireIo('reconnect_attempt');
    expect(service.status()).toBe('reconnecting');
    socket.fireIo('reconnect_failed');
    expect(service.status()).toBe('disconnected');
  });

  it('dispatches ONE upsertBatch per leads:batch', () => {
    service.start();
    socket.serverConnects();
    const dispatch = vi.spyOn(store, 'dispatch');
    const leads = Array.from({ length: 500 }, (_, i) => makeLead({ id: 'l' + i, seq: i + 1 }));
    const batch: LeadBatch = makeBatch(leads);
    socket.fire('leads:batch', batch);
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.upsertBatch({ batch, origin: 'live' }));
    let count = 0;
    store.select(selectAllLeads).subscribe(l => (count = l.length)).unsubscribe();
    expect(count).toBe(500);
  });

  it('dispatches retractLeads for leads:retracted and removes the leads from the store', () => {
    store.dispatch(
      LeadsActions.loadLeadsSuccess({
        leads: [makeLead({ id: 'a', seq: 1 }), makeLead({ id: 'b', seq: 2 })],
      })
    );
    service.start();
    socket.serverConnects();
    const dispatch = vi.spyOn(store, 'dispatch');
    socket.fire('leads:retracted', { leadIds: ['a'], seq: 9 });
    expect(dispatch).toHaveBeenCalledTimes(1);
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.retractLeads({ leadIds: ['a'], seq: 9 }));
    let ids: string[] = [];
    store
      .select(selectAllLeads)
      .subscribe(l => (ids = l.map(x => x.id)))
      .unsubscribe();
    expect(ids).toEqual(['b']);
    let seq = 0;
    store
      .select(selectLastSeq)
      .subscribe(v => (seq = v))
      .unsubscribe();
    expect(seq).toBe(9);
  });

  it('on connect sends leads:resync with the store lastSeq', () => {
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 41 })] }));
    service.start();
    socket.serverConnects();
    expect(socket.resyncRequests()).toEqual([{ lastSeq: 41 }]);
  });

  it('resyncs again after a reconnect, from the newest lastSeq', () => {
    service.start();
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 10 })] }));
    socket.serverConnects();
    store.dispatch(LeadsActions.upsertBatch({ batch: makeBatch([makeLead({ id: 'b', seq: 25 })]) }));
    socket.connected = false;
    socket.fire('disconnect', 'ping timeout');
    socket.serverConnects();
    expect(socket.resyncRequests().map(r => r.lastSeq)).toEqual([10, 25]);
  });

  it('does not resync while the very first snapshot is loading', () => {
    store.dispatch(LeadsActions.loadLeads());
    service.start();
    socket.serverConnects();
    expect(socket.resyncRequests()).toEqual([]);
  });

  it('delta resync dispatches every batch and advances lastSeq to currentSeq', () => {
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 10 })] }));
    service.start();
    socket.serverConnects();
    const dispatch = vi.spyOn(store, 'dispatch');
    const b1 = makeBatch([makeLead({ id: 'x', seq: 11 })]);
    const b2 = makeBatch([makeLead({ id: 'y', seq: 12 })]);
    socket.resyncAck?.({ mode: 'delta', batches: [b1, b2], currentSeq: 30 });
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.upsertBatch({ batch: b1, origin: 'resync' }));
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.upsertBatch({ batch: b2, origin: 'resync' }));
    let seq = 0;
    store.select(selectLastSeq).subscribe(s => (seq = s)).unsubscribe();
    expect(seq).toBe(30);
  });

  it('full resync resets lastSeq and reloads the snapshot', () => {
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 10 })] }));
    service.start();
    socket.serverConnects();
    const dispatch = vi.spyOn(store, 'dispatch');
    socket.resyncAck?.({ mode: 'full', reason: 'gap-too-large', currentSeq: 99999 });
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.resetSeq({ lastSeq: 99999 }));
    expect(dispatch).toHaveBeenCalledWith(LeadsActions.loadLeads());
    let seq = 0;
    store.select(selectLastSeq).subscribe(s => (seq = s)).unsubscribe();
    expect(seq).toBe(99999);
  });

  it('skips the post-snapshot resync that follows a full resync, but not later ones', () => {
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 10 })] }));
    service.start();
    socket.serverConnects();
    socket.resyncAck?.({ mode: 'full', reason: 'unknown-seq', currentSeq: 50 });
    const before = socket.resyncRequests().length;
    service.resyncAfterSnapshot();
    expect(socket.resyncRequests()).toHaveLength(before);
    service.resyncAfterSnapshot();
    expect(socket.resyncRequests()).toHaveLength(before + 1);
  });

  it('leads:resync-required triggers a resync', () => {
    store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'a', seq: 10 })] }));
    service.start();
    socket.serverConnects();
    socket.fire('leads:resync-required', { currentSeq: 20 });
    expect(socket.resyncRequests()).toHaveLength(2);
  });

  describe('unauthorized handshake', () => {
    it('refreshes the token, then reconnects', () => {
      service.start();
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      expect(auth.refresh).toHaveBeenCalledTimes(1);
      expect(socket.connectCalls).toBe(2);
      expect(service.status()).toBe('reconnecting');
    });

    it('refreshes only once per failure streak and stays unauthorized', () => {
      service.start();
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      expect(auth.refresh).toHaveBeenCalledTimes(1);
      expect(socket.connectCalls).toBe(2);
      expect(service.status()).toBe('unauthorized');
    });

    it('a successful connection re-arms the refresh', () => {
      service.start();
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      socket.serverConnects();
      socket.connected = false;
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      expect(auth.refresh).toHaveBeenCalledTimes(2);
    });

    it('stays unauthorized when the refresh fails', () => {
      auth.refresh.mockReturnValue(throwError(() => new Error('nope')));
      service.start();
      socket.fire('connect_error', new Error(UNAUTHORIZED));
      expect(service.status()).toBe('unauthorized');
      expect(socket.connectCalls).toBe(1);
    });

    it('other connect errors only mark the service as reconnecting', () => {
      service.start();
      socket.fire('connect_error', new Error('xhr poll error'));
      expect(auth.refresh).not.toHaveBeenCalled();
      expect(service.status()).toBe('reconnecting');
    });
  });

  it('reconnects manually when the server closed the connection', () => {
    service.start();
    socket.serverConnects();
    socket.connected = false;
    socket.fire('disconnect', 'io server disconnect');
    expect(socket.connectCalls).toBe(2);
  });

  it('a client-initiated disconnect is reported as disconnected', () => {
    service.start();
    socket.serverConnects();
    service.stop();
    expect(socket.disconnectCalls).toBe(1);
    expect(service.status()).toBe('disconnected');
  });

  it('sendAcks emits latency:ack only while connected and with data', () => {
    service.start();
    const ack: LatencyAck = { leadId: 'a', seq: 1, renderedAt: 5, timings: { scrapedAt: 1, ingestedAt: 2 } };
    service.sendAcks([ack]);
    expect(socket.emitted.filter(e => e.event === 'latency:ack')).toHaveLength(0);
    socket.serverConnects();
    service.sendAcks([]);
    service.sendAcks([ack]);
    expect(socket.emitted.filter(e => e.event === 'latency:ack')).toEqual([
      { event: 'latency:ack', payload: [ack] },
    ]);
  });

});
