import { Injectable, InjectionToken, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { io } from 'socket.io-client';
import type { LatencyAck, LeadBatch, ResyncRequest, ResyncResponse } from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';
import { AuthService } from '../auth/auth.service';
import { RealtimeStatus } from '../models/connection.model';
import { LeadsActions } from '../store/leads/leads.actions';
import { selectLastSeq, selectLeadsLoading } from '../store/leads/leads.selectors';

/** The subset of the socket.io-client `Socket` this app uses (also what tests fake). */
export interface RealtimeSocket {
  readonly connected: boolean;
  connect(): void;
  disconnect(): void;
  on(event: 'connect', cb: () => void): void;
  on(event: 'disconnect', cb: (reason: string) => void): void;
  on(event: 'connect_error', cb: (err: Error) => void): void;
  on(event: 'leads:batch', cb: (batch: LeadBatch) => void): void;
  on(event: 'leads:resync-required', cb: (info: { currentSeq: number }) => void): void;
  emit(event: 'leads:resync', req: ResyncRequest, ack: (res: ResyncResponse) => void): void;
  emit(event: 'latency:ack', acks: LatencyAck[]): void;
  readonly io: {
    on(event: 'reconnect_attempt' | 'reconnect_failed' | 'reconnect', cb: () => void): void;
  };
}

/** Creates a not-yet-connected socket; `getToken` is read on every (re)connection attempt. */
export type SocketFactory = (url: string, getToken: () => string | null) => RealtimeSocket;

export const defaultSocketFactory: SocketFactory = (url, getToken) =>
  io(url, {
    autoConnect: false,
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 10_000,
    randomizationFactor: 0.5,
    auth: cb => cb({ token: getToken() }),
  }) as unknown as RealtimeSocket;

export const SOCKET_FACTORY = new InjectionToken<SocketFactory>('SOCKET_FACTORY', {
  providedIn: 'root',
  factory: () => defaultSocketFactory,
});

export const UNAUTHORIZED = 'unauthorized';

/**
 * Live-mode Socket.IO client. One `leads:batch` becomes ONE store dispatch; (re)connections resync
 * from the store's `lastSeq`; an `unauthorized` handshake refreshes the token and reconnects once.
 */
@Injectable({ providedIn: 'root' })
export class RealtimeService {
  private readonly store = inject(Store);
  private readonly auth = inject(AuthService);
  private readonly env = inject(ENVIRONMENT);
  private readonly createSocket = inject(SOCKET_FACTORY);

  private readonly _status = signal<RealtimeStatus>('disconnected');
  readonly status = this._status.asReadonly();

  private readonly lastSeq = this.store.selectSignal(selectLastSeq);
  private readonly loading = this.store.selectSignal(selectLeadsLoading);

  private socket: RealtimeSocket | null = null;
  /** True after one token refresh attempt for the current handshake failure streak. */
  private refreshAttempted = false;
  /** A `full` resync triggers a snapshot reload whose success must not resync again. */
  private skipNextPostSnapshot = false;

  /** Connects (logging in first when needed). Safe to call more than once. */
  start(): void {
    if (this.socket) return;
    this.setStatus('connecting');
    this.auth.ensureToken().subscribe({
      next: () => this.open(),
      error: () => this.setStatus('unauthorized'),
    });
  }

  stop(): void {
    this.socket?.disconnect();
    this.socket = null;
    this.setStatus('disconnected');
  }

  /** Called after a REST snapshot finished: closes the gap between snapshot and socket. */
  resyncAfterSnapshot(): void {
    if (this.skipNextPostSnapshot) {
      this.skipNextPostSnapshot = false;
      return;
    }
    this.resync();
  }

  /** Reports render latency of sampled leads (`latency:ack`). */
  sendAcks(acks: LatencyAck[]): void {
    if (!acks.length || !this.socket?.connected) return;
    this.socket.emit('latency:ack', acks);
  }

  private open(): void {
    if (this.socket) return;
    const socket = this.createSocket(this.env.socketUrl, () => this.auth.accessToken());
    this.socket = socket;

    socket.on('connect', () => {
      this.refreshAttempted = false;
      this.setStatus('connected');
      this.resync();
    });
    socket.on('disconnect', reason => {
      if (reason === 'io client disconnect') {
        this.setStatus('disconnected');
        return;
      }
      this.setStatus('reconnecting');
      // The server closed the connection: socket.io does not retry on its own in that case.
      if (reason === 'io server disconnect') socket.connect();
    });
    socket.on('connect_error', err => this.onConnectError(socket, err));
    socket.on('leads:batch', batch => {
      this.store.dispatch(LeadsActions.upsertBatch({ batch, origin: 'live' }));
    });
    socket.on('leads:resync-required', () => this.resync());
    socket.io.on('reconnect_attempt', () => this.setStatus('reconnecting'));
    socket.io.on('reconnect_failed', () => this.setStatus('disconnected'));

    socket.connect();
  }

  private onConnectError(socket: RealtimeSocket, err: Error): void {
    if (err.message !== UNAUTHORIZED) {
      this.setStatus('reconnecting');
      return;
    }
    this.setStatus('unauthorized');
    // socket.io does not retry after a rejected handshake: refresh the token, then reconnect once.
    if (this.refreshAttempted) return;
    this.refreshAttempted = true;
    this.auth.refresh().subscribe({
      next: () => {
        this.setStatus('reconnecting');
        socket.connect();
      },
      error: () => this.setStatus('unauthorized'),
    });
  }

  private resync(): void {
    const socket = this.socket;
    if (!socket?.connected) return;
    const lastSeq = this.lastSeq();
    // Nothing to resync from while the very first snapshot is still loading.
    if (lastSeq <= 0 && this.loading()) return;
    socket.emit('leads:resync', { lastSeq }, res => this.applyResync(res));
  }

  private applyResync(res: ResyncResponse): void {
    if (res.mode === 'delta') {
      for (const batch of res.batches) {
        this.store.dispatch(LeadsActions.upsertBatch({ batch, origin: 'resync' }));
      }
      // Leads filtered out by the user's subscriptions never show up in a batch: still advance.
      if (res.currentSeq > this.lastSeq()) {
        this.store.dispatch(LeadsActions.resetSeq({ lastSeq: res.currentSeq }));
      }
      return;
    }
    this.skipNextPostSnapshot = true;
    this.store.dispatch(LeadsActions.resetSeq({ lastSeq: res.currentSeq }));
    this.store.dispatch(LeadsActions.loadLeads());
  }

  private setStatus(status: RealtimeStatus): void {
    if (this._status() === status) return;
    this._status.set(status);
    this.store.dispatch(LeadsActions.setConnection({ status }));
  }
}
