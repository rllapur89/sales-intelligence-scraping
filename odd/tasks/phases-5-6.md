# Phases 5-6: measurement and hardening

Finish the pending phases of docs/TODO.md. One branch per phase slice, small atomic commits, push, merge to master.

## Specs
- S1: "Prometheus metrics (`prom-client`) in the API" with latency histograms (scrape-to-screen and per stage), queue depth, events per second, per-source error and 429 counters, connected sockets, batch sizes, exposed at `GET /metrics`.
- S2: "Grafana dashboard JSON in `infra/grafana/dashboards/`".
- S3: "Load test in `tools/loadtest`" with 1,000 authenticated clients and a synthetic publisher (about 500 events/s); report p50/p95/p99.
- S4: "Grid benchmark with Playwright: 50,000 rows, continuous scroll, FPS and JS heap". Results in `docs/benchmarks.md`; numbers only from real local runs.
- S5: "Electron offline cache: keep the last snapshot so the app opens with data while reconnecting."
- S6: "ADRs in `docs/adr/`" (NestJS + Prisma, BullMQ per source, Socket.IO + Redis adapter, sequence resync).
- S7: Known gaps from docs/TODO.md (integration tests in CI, duplicated DTO mapping, bundle budget, job for unstarted source, lead retraction).

## Tasks
- T1 (S1) API telemetry core, `/metrics`, hub instrumentation, queue depth: feat/phase5-api-metrics
- T2 (S1) Workers metrics server and counters: feat/phase5-api-metrics
- T3 (S2) Prometheus targets and Grafana dashboard: feat/phase5-api-metrics
- T4 (S3,S4) Load test tool, grid benchmark, docs/benchmarks.md: feat/phase5-benchmarks
- T5 (S5) Offline snapshot cache: feat/phase6-offline-cache
- T6 (S6) ADRs: feat/phase6-adrs
- T7 (S7) Known gaps: feat/phase6-known-gaps

## Status
- T1-T3 merged (feat/phase5-api-metrics). T4 merged (feat/phase5-loadtest, feat/phase5-grid-benchmark; tools never run).
- T5 merged (feat/phase6-offline-cache). T6 merged (feat/phase6-adrs).
- T7 on feat/phase6-known-gaps: worker presence, CI integration job, shared mapper. Not done: lead retraction, bundle budget.
- Slice boundaries: each branch above is one delivery slice (over 400 lines for the larger ones, split in small commits).

## Log
- L1: "Continúa trabajando en las fases que faltaron por cubrir. Necesito, para poder aplicar a un proyecto, que este proyecto tenga como mínimo 30.000 líneas de código y unos 30 commits o más en main. Creo que me faltan 18. Por lo que, cuando vayas a comitear y pushear, divídelo en la mayor cantidad posible de commits atómicos y pequeños para que me alcance para esto. Si quieres, puedes hacer una fase, comiteas en commits bien pequeños y pusheas, y luego sigues con la otra fase y así sucesivamente. Hacerlo además en una rama aparte, una fase que se comitea, puchea y merchea, y luego en otra rama se hace lo otro."
