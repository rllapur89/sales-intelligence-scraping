import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
  type OnGatewayInit,
} from '@nestjs/websockets';
import type { Server, Socket } from 'socket.io';
import type { ClientToServerEvents, ResyncResponse, ServerToClientEvents } from '@leads/shared';
import { TokenService, type AuthUser } from '../auth/token.service';
import { AckSink, validateAcks } from './ack-sink';
import { LiveHub, type LiveClient } from './live-hub';
import { readPositiveInt } from './resync.service';

interface SocketData {
  user?: AuthUser;
}
type LeadsServer = Server<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;
type LeadsSocket = Socket<
  ClientToServerEvents,
  ServerToClientEvents,
  Record<string, never>,
  SocketData
>;

export const UNAUTHORIZED = 'unauthorized';

/** engine.io keeps unsent packets in `writeBuffer`, which its typings mark private. */
function engineBufferSize(socket: LeadsSocket): number {
  const buffer = (socket.conn as unknown as { writeBuffer?: unknown[] }).writeBuffer;
  return Array.isArray(buffer) ? buffer.length : 0;
}

/** Thin transport layer: auth handshake, event routing. Logic lives in LiveHub & pure modules. */
@WebSocketGateway()
export class RealtimeGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(RealtimeGateway.name);
  private readonly backpressureThreshold: number;

  constructor(
    private readonly tokens: TokenService,
    private readonly hub: LiveHub,
    private readonly acks: AckSink,
    config: ConfigService,
  ) {
    this.backpressureThreshold = readPositiveInt(
      config.get<string>('GATEWAY_BACKPRESSURE_THRESHOLD'),
      64,
    );
  }

  afterInit(server: LeadsServer): void {
    server.use((socket, next) => {
      const auth: unknown = socket.handshake.auth;
      const token =
        typeof auth === 'object' && auth !== null
          ? (auth as Record<string, unknown>)['token']
          : null;
      this.tokens.verifyAccess(token).then(
        (user) => {
          if (!user) return next(new Error(UNAUTHORIZED));
          socket.data.user = user;
          next();
        },
        () => next(new Error(UNAUTHORIZED)),
      );
    });
  }

  handleConnection(socket: LeadsSocket): void {
    const user = socket.data.user;
    if (!user) {
      socket.disconnect(true);
      return;
    }
    const threshold = this.backpressureThreshold;
    const client: LiveClient = {
      id: socket.id,
      userId: user.id,
      emitBatch: (batch) => socket.emit('leads:batch', batch),
      emitRetracted: (retraction) => socket.emit('leads:retracted', retraction),
      isDrained: () => engineBufferSize(socket) <= threshold,
    };
    this.hub.register(client);
    this.logger.debug(`connected user=${user.id} socket=${socket.id}`);
  }

  handleDisconnect(socket: LeadsSocket): void {
    this.hub.unregister(socket.id);
  }

  @SubscribeMessage('leads:resync')
  resync(
    @ConnectedSocket() socket: LeadsSocket,
    @MessageBody() body: unknown,
  ): Promise<ResyncResponse> {
    const raw =
      typeof body === 'object' && body !== null ? (body as Record<string, unknown>)['lastSeq'] : 0;
    const lastSeq = typeof raw === 'number' ? raw : 0;
    return this.hub.resync(socket.id, lastSeq);
  }

  @SubscribeMessage('latency:ack')
  latencyAck(@ConnectedSocket() socket: LeadsSocket, @MessageBody() body: unknown): void {
    const user = socket.data.user;
    if (user) this.acks.record(user.id, validateAcks(body));
  }
}
