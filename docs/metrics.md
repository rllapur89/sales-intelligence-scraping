# Metrics reference

The API exposes `GET /metrics` (no `/api` prefix, no auth, meant for a private network) and the workers
expose `GET /metrics` on `WORKERS_METRICS_PORT` (default `3100`, `0` disables it). Prometheus scrapes both
(`infra/prometheus/prometheus.yml`) and the Grafana dashboard `infra/grafana/dashboards/pipeline.json`
is provisioned by `docker-compose.yml`.

## How latency is measured

Every lead event carries `scrapedAt` and `ingestedAt`. The gateway adds `publishedAt`, and the client
adds `renderedAt` on a sample of events and sends it back as a `latency:ack`. The API turns each ack into
four observations of `leads_pipeline_latency_seconds{stage}`:

| Stage               | Formula                    |
| ------------------- | -------------------------- |
| `scrape_to_ingest`  | `ingestedAt - scrapedAt`   |
| `ingest_to_publish` | `publishedAt - ingestedAt` |
| `publish_to_render` | `renderedAt - publishedAt` |
| `scrape_to_screen`  | `renderedAt - scrapedAt`   |

The timestamps come from three clocks (workers, API, browser). A negative delta is clock skew, so that
stage is dropped instead of recorded. On one machine the skew is zero, which is why the load test runs
locally.

## API metrics

| Metric                           | Type      | Labels        | Meaning                                  |
| -------------------------------- | --------- | ------------- | ---------------------------------------- |
| `leads_pipeline_latency_seconds` | histogram | `stage`       | Stage latency from client acks           |
| `leads_latency_acks_total`       | counter   |               | Valid acks received                      |
| `leads_events_received_total`    | counter   |               | Lead events read from Redis              |
| `leads_events_invalid_total`     | counter   |               | Unparseable messages on the lead channel |
| `leads_batch_size`               | histogram |               | Leads per batch offered to a socket      |
| `leads_connected_sockets`        | gauge     |               | Sockets on this instance                 |
| `leads_queue_jobs`               | gauge     | `queue,state` | BullMQ job counts, polled every 5 s      |
| `leads_api_*`                    | default   |               | Node process metrics (`prom-client`)     |

## Workers metrics

| Metric                                    | Type      | Labels           | Meaning                                |
| ----------------------------------------- | --------- | ---------------- | -------------------------------------- |
| `leads_scrape_tasks_total`                | counter   | `source,outcome` | Finished tasks (`scraped` or `failed`) |
| `leads_scrape_duration_seconds`           | histogram | `source`         | Task duration                          |
| `leads_scrape_items_found`                | histogram | `source`         | Items per task                         |
| `leads_scrape_rate_limited_total`         | counter   | `source`         | 429s and exhausted rate limits         |
| `leads_scrape_queue_paused_seconds_total` | counter   | `source`         | Seconds a queue was paused             |
| `leads_scrape_retries_total`              | counter   | `source`         | Attempts handed back for retry         |
| `leads_ingestion_results_total`           | counter   | `result`         | Ingested raw results (`ok`/`error`)    |
| `leads_workers_*`                         | default   |                  | Node process metrics                   |

## Try it

```bash
docker compose up -d prometheus grafana
npm run dev -w @leads/api        # http://localhost:3000/metrics
npm run dev -w @leads/workers    # http://localhost:3100/metrics
```

Grafana runs on `http://localhost:3001` (admin / admin by default), folder "Sales Intelligence".
