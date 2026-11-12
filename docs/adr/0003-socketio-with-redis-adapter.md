# ADR 0003: Socket.IO with the Redis adapter for live updates

Status: accepted

## Context

Clients need new and updated leads within about a second, filtered by each user's subscriptions. The
workers and the API are separate processes, and more than one API instance may run behind a load
balancer. Clients may also be an Electron app on an unreliable network.

## Decision

- The ingestion worker publishes each `lead.upserted` event on the Redis channel `leads:events`. Every
  API instance subscribes to it, so instances do not need to know about the workers.
- The gateway uses Socket.IO (`@nestjs/platform-socket.io`) with `@socket.io/redis-adapter`, so rooms and
  broadcasts work across instances. A handshake middleware verifies the access JWT and rejects the
  connection with `unauthorized` otherwise.
- Events are coalesced per lead in a short window (`GATEWAY_BATCH_WINDOW_MS`, 200 ms by default), then
  filtered per socket against the user's active subscriptions and sent as one `leads:batch`.
- Each socket has an outbox with backpressure: while the engine.io write buffer is above
  `GATEWAY_BACKPRESSURE_THRESHOLD`, newer versions of the same lead replace pending ones instead of
  queueing more batches.
- Subscription changes publish on `leads:subscriptions-changed`; each instance reloads the filters of
  that user's sockets.
- Clients send sampled `latency:ack` messages. The API validates them (at most 100 per emit) and turns
  them into Prometheus histograms.

## Consequences

- Horizontal scaling needs no sticky state beyond the Socket.IO transport. Several API instances behind
  one Redis have not been tested yet (see `docs/TODO.md`).
- Redis pub/sub is fire and forget: an instance that is down misses events. That is why clients can
  resync (ADR 0004) instead of trusting the stream.
- Per-user filtering is done in the API for every window and socket, which costs CPU proportional to
  sockets times leads per window. The load test (`tools/loadtest`) exists to measure that cost.
- Redis becomes a required dependency of the API, not only of the workers.
