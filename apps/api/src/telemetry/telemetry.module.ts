import { Global, Module } from '@nestjs/common';
import { AckSink } from '../realtime/ack-sink';
import { PromAckSink } from './prom-ack-sink';
import { TelemetryController } from './telemetry.controller';
import { TelemetryService } from './telemetry.service';

@Global()
@Module({
  controllers: [TelemetryController],
  providers: [TelemetryService, PromAckSink, { provide: AckSink, useExisting: PromAckSink }],
  exports: [TelemetryService, AckSink],
})
export class TelemetryModule {}
