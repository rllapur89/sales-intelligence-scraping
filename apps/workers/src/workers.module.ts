import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { validateEnv } from './config/env';
import { QueueService } from './queues/queue.service';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      envFilePath: ['.env', '../../.env'],
      validate: (raw) => ({ ...raw, ...validateEnv(raw) }),
    }),
  ],
  providers: [QueueService],
})
export class WorkersModule {}
