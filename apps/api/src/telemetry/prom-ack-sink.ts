import { Injectable } from '@nestjs/common';
import type { LatencyAck } from '@leads/shared';
import { AckSink } from '../realtime/ack-sink';
import { stageLatencies } from './latency';
import { TelemetryService } from './telemetry.service';

/** Turns validated client acks into per-stage latency histogram observations. */
@Injectable()
export class PromAckSink extends AckSink {
  constructor(private readonly telemetry: TelemetryService) {
    super();
  }

  record(_userId: string, acks: readonly LatencyAck[]): void {
    if (acks.length === 0) return;
    this.telemetry.countAcks(acks.length);
    for (const ack of acks) {
      for (const { stage, seconds } of stageLatencies(ack)) {
        this.telemetry.observeStage(stage, seconds);
      }
    }
  }
}
