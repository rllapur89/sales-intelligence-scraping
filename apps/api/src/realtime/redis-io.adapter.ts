import type { INestApplicationContext } from '@nestjs/common';
import { IoAdapter } from '@nestjs/platform-socket.io';
import { createAdapter } from '@socket.io/redis-adapter';
import { Redis } from 'ioredis';
import type { Server, ServerOptions } from 'socket.io';

/** Socket.IO adapter with CORS and the Redis adapter so several API instances share rooms. */
export class RedisIoAdapter extends IoAdapter {
  private pub: Redis | null = null;
  private sub: Redis | null = null;
  private adapterFactory: ReturnType<typeof createAdapter> | null = null;

  constructor(
    app: INestApplicationContext,
    private readonly redisUrl: string,
    private readonly corsOrigin: string,
  ) {
    super(app);
  }

  connect(): void {
    this.pub = new Redis(this.redisUrl);
    this.sub = this.pub.duplicate();
    this.adapterFactory = createAdapter(this.pub, this.sub);
  }

  override createIOServer(port: number, options?: ServerOptions): Server {
    const server = super.createIOServer(port, {
      ...options,
      cors: { origin: this.corsOrigin },
    }) as Server;
    if (this.adapterFactory) server.adapter(this.adapterFactory);
    return server;
  }

  override async dispose(): Promise<void> {
    await super.dispose();
    this.pub?.disconnect();
    this.sub?.disconnect();
  }
}
