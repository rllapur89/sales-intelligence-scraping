import { Module } from '@nestjs/common';
import { LiveHub } from './live-hub';
import { RealtimeGateway } from './realtime.gateway';
import { ResyncService } from './resync.service';

@Module({
  providers: [LiveHub, ResyncService, RealtimeGateway],
})
export class RealtimeModule {}
