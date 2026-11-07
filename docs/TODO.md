# TODO: pending phases

Phases 1 to 4 are implemented. Phases 5 and 6 are intentionally left for later. Rules that still
apply: no personal data, verify each source's terms before adding it, numbers in the README must come
from local runs of this project.

## Phase 5: measurement (not started)

- **Event timestamps:** `scrapedAt` and `ingestedAt` already travel in every event, and the gateway sets
  `publishedAt`. The client already stamps `renderedAt` and sends sampled `latency:ack`s. The API only
  counts them in memory (`AckSink` in `apps/api/src/realtime/ack-sink.ts`).
- **Prometheus metrics (`prom-client`) in the API:**
  - Histogram for scrape-to-screen latency (`renderedAt - scrapedAt`) and per stage: scrape to ingest,
    ingest to publish, publish to render.
  - Queue depth per queue, events per second, per-source error counters and rate-limit (429)
    counters, connected sockets, batch sizes.
  - Expose `GET /metrics` (public or on a separate port); Prometheus already scrapes
    `host.docker.internal:3000/metrics` (`infra/prometheus/prometheus.yml`).
- **Grafana dashboard JSON** in `infra/grafana/dashboards/` (the folder is provisioned by
  `docker-compose.yml`).
- **Load test in `tools/loadtest`:** Artillery with the Socket.IO engine, 1,000 authenticated clients
  with varied subscriptions, plus a synthetic publisher pushing about 500 events/s into the ingestion
  queue. Report p50/p95/p99 scrape-to-screen latency.
- **Grid benchmark with Playwright:** 50,000 rows, continuous scroll, FPS and JS heap before and after.
  Needs `npx playwright install chromium`.
- **Results in `docs/benchmarks.md`.** The README must state that the numbers come from local load
  tests of this project.
- **Host note:** this machine ran out of committed memory several times. Run one heavy process at a
  time and use `NODE_OPTIONS=--max-semi-space-size=1`.

## Phase 6: hardening (not started)

- **Electron offline cache:** keep the last snapshot (IndexedDB or a file in `userData`) so the app
  opens with data while reconnecting.
- **Electron memory leaks:** take heap snapshots, find and fix leaks, and write the before/after in
  `docs/electron-memory.md`. Re-verify `electron-builder` packaging inside the npm workspace
  (hoisted `node_modules`).
- **Grid at 50,000+ rows:** confirm it stays smooth (CDK virtual scroll is in place; measure it in
  phase 5).
- **ADRs in `docs/adr/`:** NestJS + Prisma, BullMQ queue per source, Socket.IO with the Redis
  adapter, sequence-number resync (including the out-of-order autoincrement overlap).
- **Final README pass** and a full test run, including integration tests in CI.

## Known gaps to pick up with them

- Integration tests (`npm run test:integration -w @leads/workers`, and
  `INTEGRATION_TESTS=1 ... vitest run src/integration` in `apps/api`) are not part of CI yet. They
  need Postgres and Redis (compose services) and a migrated `integration` schema.
- The live desktop client was verified with unit tests and a Node socket client, never in a browser or
  an Electron window.
- Several API instances behind one Redis were not tested (single instance only).
- `POST /api/jobs` accepts a reviewed source whose worker did not start (for example `github` without
  `GITHUB_TOKEN`); the job stays queued.
- The desktop initial bundle is 500.80 kB, 800 bytes over the 500 kB warning budget in `angular.json`.
- The API and the workers each map DB rows to `LeadDto`; consolidate them.
- Postings that disappear from a board are not retired; scores decay by signal age.
- A lead whose score drops below a subscription's minimum is not retracted from clients that hold it.
- RemoteOK jobs rarely expose a company domain, so that source yields few leads.
- Hacker News "Who is hiring" is skipped by the owner's decision (terms unclear).
- Tickers in `apps/workers/config/companies.json` (`secTicker`) are unverified until a run with
  `SEC_EDGAR_USER_AGENT` set; the scraper skips a company whose EDGAR name does not match.
