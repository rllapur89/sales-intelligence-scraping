# Benchmarks

This page is the place for numbers measured on this project. **No measured result is recorded yet.**
The tools exist and are tested, but the runs below need Docker (Postgres, Redis) and Chromium, which were
not available when they were written. Until a run is pasted here, treat any latency or FPS figure as
unknown. Do not quote numbers from anywhere else in the README.

## How to produce the numbers

| Question                              | Tool                   | Guide                                       |
| ------------------------------------- | ---------------------- | ------------------------------------------- |
| Scrape-to-screen latency, 1,000 users | `tools/loadtest`       | [README](../tools/loadtest/README.md)       |
| Grid FPS and heap at 50,000 rows      | `tools/grid-benchmark` | [README](../tools/grid-benchmark/README.md) |
| What each metric means                | Prometheus + Grafana   | [metrics.md](./metrics.md)                  |

Run one heavy process at a time and set `NODE_OPTIONS=--max-semi-space-size=1` on a memory-starved host.

## Load test (1,000 clients, 500 events/s)

Status: not run.

Paste the generated report here, including the date, machine and Node version it prints.

## Grid benchmark (50,000 rows)

Status: not run.

Paste the generated table here. The baseline row (1,200 rows) is the "before" figure.

## Reading the results

- Compare p95 and p99, not the mean: a smooth average hides the frames and events users notice.
- A load test whose achieved rate is below the target rate measured the load generator, not the API.
- Latency in the load test excludes rendering. The desktop client adds its own `renderedAt`, which is
  what `leads_pipeline_latency_seconds{stage="scrape_to_screen"}` reports in Grafana.
