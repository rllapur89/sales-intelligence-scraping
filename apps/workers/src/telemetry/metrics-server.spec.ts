import type { AddressInfo } from 'node:net';
import { afterEach, describe, expect, it } from 'vitest';
import { Counter, Registry } from 'prom-client';
import {
  DEFAULT_METRICS_PORT,
  readMetricsPort,
  startMetricsServer,
  stopMetricsServer,
} from './metrics-server';

describe('readMetricsPort', () => {
  it('defaults when unset, blank or invalid', () => {
    expect(readMetricsPort(undefined)).toBe(DEFAULT_METRICS_PORT);
    expect(readMetricsPort('  ')).toBe(DEFAULT_METRICS_PORT);
    expect(readMetricsPort('abc')).toBe(DEFAULT_METRICS_PORT);
    expect(readMetricsPort('70000')).toBe(DEFAULT_METRICS_PORT);
  });

  it('parses a valid port and treats 0 as disabled', () => {
    expect(readMetricsPort('9100')).toBe(9100);
    expect(readMetricsPort('0')).toBeNull();
  });
});

describe('metrics server', () => {
  const stops: Array<() => Promise<void>> = [];
  afterEach(async () => {
    for (const stop of stops.splice(0)) await stop();
  });

  async function start(): Promise<string> {
    const registry = new Registry();
    new Counter({ name: 'demo_total', help: 'demo', registers: [registry] }).inc(3);
    const server = await startMetricsServer(registry, 0);
    stops.push(() => stopMetricsServer(server));
    return `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
  }

  it('serves the registry at /metrics', async () => {
    const base = await start();
    const res = await fetch(`${base}/metrics`);
    expect(res.status).toBe(200);
    expect(res.headers.get('content-type')).toContain('text/plain');
    expect(await res.text()).toContain('demo_total 3');
  });

  it('answers 404 for any other path or method', async () => {
    const base = await start();
    expect((await fetch(`${base}/other`)).status).toBe(404);
    expect((await fetch(`${base}/metrics`, { method: 'POST' })).status).toBe(404);
  });
});
