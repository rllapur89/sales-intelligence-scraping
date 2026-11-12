import { Injectable } from '@nestjs/common';
import { Counter, Gauge, Histogram, Registry, collectDefaultMetrics } from 'prom-client';
import { LATENCY_BUCKETS_SECONDS, type PipelineStage } from './latency';

export const BATCH_SIZE_BUCKETS = [1, 2, 5, 10, 25, 50, 100, 250, 500] as const;

/** Owns the Prometheus registry of the API. Other modules record through typed methods. */
@Injectable()
export class TelemetryService {
  readonly registry = new Registry();

  private readonly stageLatency = new Histogram({
    name: 'leads_pipeline_latency_seconds',
    help: 'Latency of each pipeline stage, from client latency acks',
    labelNames: ['stage'] as const,
    buckets: [...LATENCY_BUCKETS_SECONDS],
    registers: [this.registry],
  });

  private readonly eventsReceived = new Counter({
    name: 'leads_events_received_total',
    help: 'Lead events received from the ingestion channel',
    registers: [this.registry],
  });

  private readonly invalidEvents = new Counter({
    name: 'leads_events_invalid_total',
    help: 'Messages on the lead channel that could not be parsed',
    registers: [this.registry],
  });

  private readonly batchSize = new Histogram({
    name: 'leads_batch_size',
    help: 'Number of leads in each batch offered to a socket',
    buckets: [...BATCH_SIZE_BUCKETS],
    registers: [this.registry],
  });

  private readonly acksReceived = new Counter({
    name: 'leads_latency_acks_total',
    help: 'Valid latency acks received from clients',
    registers: [this.registry],
  });

  private readonly sockets = new Gauge({
    name: 'leads_connected_sockets',
    help: 'Sockets currently connected to this API instance',
    registers: [this.registry],
  });

  private readonly queueDepth = new Gauge({
    name: 'leads_queue_jobs',
    help: 'Jobs per BullMQ queue and state',
    labelNames: ['queue', 'state'] as const,
    registers: [this.registry],
  });

  constructor() {
    collectDefaultMetrics({ register: this.registry, prefix: 'leads_api_' });
  }

  observeStage(stage: PipelineStage, seconds: number): void {
    this.stageLatency.observe({ stage }, seconds);
  }

  countAcks(n: number): void {
    this.acksReceived.inc(n);
  }

  countEvent(): void {
    this.eventsReceived.inc();
  }

  countInvalidEvent(): void {
    this.invalidEvents.inc();
  }

  observeBatch(leads: number): void {
    this.batchSize.observe(leads);
  }

  setSockets(n: number): void {
    this.sockets.set(n);
  }

  setQueueDepth(queue: string, state: string, n: number): void {
    this.queueDepth.set({ queue, state }, n);
  }

  /** Prometheus text exposition format. */
  render(): Promise<string> {
    return this.registry.metrics();
  }

  get contentType(): string {
    return this.registry.contentType;
  }
}
