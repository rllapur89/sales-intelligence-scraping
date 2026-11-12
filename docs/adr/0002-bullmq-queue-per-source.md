# ADR 0002: One BullMQ queue and limiter per data source

Status: accepted

## Context

The platform collects from public sources with different rules: a courtesy limit for job boards, a
documented 5,000 requests per hour for GitHub, 10 requests per second across all machines for SEC EDGAR,
`Crawl-delay` in robots.txt for websites. A single shared queue would let one slow or rate-limited
source delay the others, and one limiter could not respect all of those rules.

## Decision

- Each source has its own queue (`scrape-<source>`), its own worker, concurrency, retry attempts and
  backoff, all declared in `SOURCE_POLICIES` (`packages/shared/src/scraping.ts`).
- The BullMQ limiter (`max` jobs per `durationMs`) is stored in Redis, so it is shared by every worker
  instance. A task makes a known number of requests (for example at most 4 for GitHub), and the limiter is
  sized for that.
- A `plan` job fans out into one `company` job per target, so the limiter counts company tasks, not plans.
- A source starts only when its policy is `reviewed` and every `requiredEnv` variable is set. Hacker
  News stays unreviewed because its terms are unclear.
- On a 429 or an exhausted rate limit the handler pauses only that source's queue, using `Retry-After`
  or `x-ratelimit-reset` when the response has it and jittered backoff otherwise.
- Scrapers never touch the database. They publish a `RawScrapeResult` to the `ingestion` queue; one
  ingestion worker deduplicates, scores and writes in a transaction, then publishes the event.

## Consequences

- A rate-limited or failing source only backs up its own queue, and the Grafana dashboard can show
  queue depth, 429s and retries per source.
- More queues mean more Redis keys and workers to monitor. The `leads_queue_jobs` gauge polls each queue.
- Limits are per queue, not per host. Two sources that hit the same host would need a shared limiter.
- A job for a source whose worker did not start stays queued, because the API does not know which
  workers run. This is a known gap in `docs/TODO.md`.
