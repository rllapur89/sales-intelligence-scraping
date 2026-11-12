import { createServer, type Server } from 'node:http';
import type { Registry } from 'prom-client';

export const DEFAULT_METRICS_PORT = 3100;

/** Reads `WORKERS_METRICS_PORT`: unset -> default, `0` -> disabled (null), garbage -> default. */
export function readMetricsPort(raw: string | undefined): number | null {
  if (raw === undefined || raw.trim() === '') return DEFAULT_METRICS_PORT;
  const n = Number(raw);
  if (!Number.isInteger(n) || n < 0 || n > 65535) return DEFAULT_METRICS_PORT;
  return n === 0 ? null : n;
}

/** Tiny HTTP server exposing `GET /metrics`; the workers have no other HTTP surface. */
export function startMetricsServer(registry: Registry, port: number): Promise<Server> {
  const server = createServer((req, res) => {
    if (req.method === 'GET' && req.url?.split('?')[0] === '/metrics') {
      registry.metrics().then(
        (body) => {
          res.writeHead(200, { 'Content-Type': registry.contentType, 'Cache-Control': 'no-store' });
          res.end(body);
        },
        () => {
          res.writeHead(500).end();
        },
      );
      return;
    }
    res.writeHead(404).end();
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(port, () => resolve(server));
  });
}

export function stopMetricsServer(server: Server): Promise<void> {
  return new Promise((resolve) => server.close(() => resolve()));
}
