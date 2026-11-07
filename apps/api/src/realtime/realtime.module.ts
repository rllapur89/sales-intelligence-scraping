import { Module } from '@nestjs/common';
import { AckSink, InMemoryAckSink } from './ack-sink';
import { LiveHub } from './live-hub';
import { RealtimeGateway } from './realtime.gateway';
import { ResyncService } from './resync.service';

@Module({
  providers: [
    LiveHub,
    ResyncService,
    RealtimeGateway,
    InMemoryAckSink,
    { provide: AckSink, useExisting: InMemoryAckSink },
  ],
  exports: [AckSink],
})
export class RealtimeModule {}
