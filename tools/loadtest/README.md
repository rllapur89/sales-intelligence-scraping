# Load test

Opens many authenticated Socket.IO clients against the API and pushes synthetic lead events into the
same Redis channel the ingestion worker uses. It reports p50/p95/p99 latency per leg.

It is a small purpose-built runner, not Artillery: it needs per-user subscriptions created through the
real API, latency acks sent back like the desktop client does, and pure, unit-tested percentile and
pacing code. Everything that does not touch the network is covered by `npm test -w @leads/loadtest`.

## What it does

1. Creates `LOADTEST_USERS` users (`loadtest-user-N@loadtest.invalid`) in the database, logs each one in
   through `POST /api/auth/login`, and gives each one a subscription through `POST /api/subscriptions`.
   Profiles cycle through five shapes (firehose, one industry, region + signal type, high score,
   narrow combo) so the gateway filters differently per user.
2. Opens `LOADTEST_CLIENTS` sockets, spread over those users, in ramp waves.
3. Publishes `LOADTEST_EVENTS_PER_SECOND` synthetic `lead.upserted` events for
   `LOADTEST_DURATION_SECONDS`. Leads come from a pool of 5,000 ids, so updates repeat like in
   production and the coalescer merges them. Domains use the reserved `.invalid` TLD; no personal data.
4. Every client records `receivedAt - scrapedAt` for each lead and acks one in `LOADTEST_ACK_EVERY`
   leads, which also feeds the API's `leads_pipeline_latency_seconds` histogram (see
   `docs/metrics.md`).
5. Deletes its users and prints (and optionally writes) a Markdown report.

## Run it

```bash
npm run infra:up && npm run db:migrate && npm run db:seed
npm run build:libs && npm run build -w @leads/loadtest
npm run dev -w @leads/api          # in another terminal; the workers are not needed

LOADTEST_REPORT=docs/loadtest-report.md npm start -w @leads/loadtest
```

| Variable                     | Default                  | Meaning                           |
| ---------------------------- | ------------------------ | --------------------------------- |
| `LOADTEST_API_URL`           | `http://localhost:3000`  | API base URL                      |
| `LOADTEST_REDIS_URL`         | `REDIS_URL` or localhost | Redis the API reads events from   |
| `LOADTEST_CLIENTS`           | `1000`                   | Socket clients                    |
| `LOADTEST_USERS`             | `50`                     | Distinct users and subscriptions  |
| `LOADTEST_EVENTS_PER_SECOND` | `500`                    | Publisher rate                    |
| `LOADTEST_DURATION_SECONDS`  | `60`                     | Publishing time                   |
| `LOADTEST_RAMP_BATCH`        | `50`                     | Clients opened per wave           |
| `LOADTEST_RAMP_DELAY_MS`     | `250`                    | Pause between waves               |
| `LOADTEST_ACK_EVERY`         | `10`                     | One in N delivered leads is acked |
| `LOADTEST_SEED`              | `42`                     | Seed of the generators            |
| `LOADTEST_REPORT`            | unset                    | Path of the Markdown report       |

`DATABASE_URL` must point at the development database; the tool only touches users whose email starts
with `loadtest-user-`.

## Limits of the measurement

- Clients and the publisher run on one machine, so all timestamps share one clock. Against a remote API
  the legs that mix clocks would be skewed.
- The clients do not render. `scrape to client` is the scrape-to-screen latency minus the render step.
  The render step is measured separately by the grid benchmark (`tools/grid-benchmark`).
- A single Node process runs all 1,000 clients, so on a small machine the load generator itself can be
  the bottleneck. Check the achieved rate and the event loop before blaming the API.
- Synthetic events are not in the database, so resync (`leads:resync`) is not exercised.
