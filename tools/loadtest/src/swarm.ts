import type { LatencyAck, LeadBatch } from '@leads/shared';
import type { ProvisionedUser } from './provision';
import { clientsPerUser } from './profiles';
import type { LatencyRecorder } from './recorder';

/** The part of a socket.io client the swarm uses; a fake implements it in tests. */
export interface SwarmSocket {
  on(event: string, listener: (...args: never[]) => void): unknown;
  emit(event: string, payload: unknown): unknown;
  disconnect(): unknown;
}

export type SocketFactory = (token: string) => SwarmSocket;

export interface SwarmOptions {
  rampBatchSize: number;
  rampDelayMs: number;
  ackEveryNth: number;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
}

/** Many authenticated clients that count what they receive and ack a sample of it. */
export class Swarm {
  private readonly sockets: SwarmSocket[] = [];
  private connected = 0;
  private stopping = false;
  private delivered = 0;
  private readonly now: () => number;
  private readonly sleep: (ms: number) => Promise<void>;

  constructor(
    private readonly factory: SocketFactory,
    private readonly recorder: LatencyRecorder,
    private readonly options: SwarmOptions,
  ) {
    this.now = options.now ?? Date.now;
    this.sleep = options.sleep ?? ((ms) => new Promise((r) => setTimeout(r, ms)));
  }

  get connectedCount(): number {
    return this.connected;
  }

  get socketCount(): number {
    return this.sockets.length;
  }

  /** Opens `clients` sockets spread over the users, in waves, without waiting for each handshake. */
  async start(users: readonly ProvisionedUser[], clients: number): Promise<void> {
    const split = clientsPerUser(clients, users.length);
    const plan: ProvisionedUser[] = [];
    users.forEach((user, i) => {
      for (let n = 0; n < (split[i] as number); n++) plan.push(user);
    });

    for (let i = 0; i < plan.length; i += this.options.rampBatchSize) {
      for (const user of plan.slice(i, i + this.options.rampBatchSize)) this.open(user);
      if (i + this.options.rampBatchSize < plan.length) await this.sleep(this.options.rampDelayMs);
    }
  }

  /** Resolves once `target` clients are connected or `timeoutMs` passed; returns who connected. */
  async waitConnected(target: number, timeoutMs: number): Promise<number> {
    const deadline = this.now() + timeoutMs;
    while (this.connected < target && this.now() < deadline) await this.sleep(100);
    return this.connected;
  }

  stop(): void {
    this.stopping = true;
    for (const socket of this.sockets) socket.disconnect();
  }

  private open(user: ProvisionedUser): void {
    const socket = this.factory(user.token);
    const clientId = `c${this.sockets.length}`;
    this.sockets.push(socket);

    socket.on('connect', () => {
      this.connected += 1;
    });
    socket.on('connect_error', () => this.recorder.recordConnectError());
    socket.on('disconnect', () => {
      this.connected = Math.max(0, this.connected - 1);
      if (!this.stopping) this.recorder.recordDisconnect();
    });
    socket.on('leads:batch', (batch: LeadBatch) => this.onBatch(socket, clientId, batch));
  }

  private onBatch(socket: SwarmSocket, clientId: string, batch: LeadBatch): void {
    const receivedAt = this.now();
    this.recorder.recordBatch(clientId, batch, receivedAt);

    const acks: LatencyAck[] = [];
    for (const lead of batch.leads) {
      this.delivered += 1;
      const timings = batch.timings[lead.id];
      if (timings && this.delivered % this.options.ackEveryNth === 0) {
        acks.push({ leadId: lead.id, seq: lead.seq, renderedAt: receivedAt, timings });
      }
    }
    if (acks.length > 0) socket.emit('latency:ack', acks);
  }
}
