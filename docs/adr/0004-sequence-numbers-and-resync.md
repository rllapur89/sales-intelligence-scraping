# ADR 0004: Sequence numbers, coalescing and delta resync

Status: accepted

## Context

A live stream over Redis pub/sub and WebSockets loses events when a client reconnects, sleeps or is
slow. The client must be able to converge to the same state as the database without downloading
everything each time.

## Decision

- Every change to a lead is appended to a log table with a `BigInt` autoincrement `seq`. The lead row
  also stores the `seq` of the last event that touched it, and each event carries it.
- The client remembers the highest `toSeq` it received. After connecting it sends
  `leads:resync { lastSeq }`; `planResync` decides:
  - `unknown-seq`: `lastSeq` is zero, not finite, or greater than the current sequence (for example
    after a database reset). The server answers with `mode: 'full'`.
  - `gap-too-large`: more than `maxGap` events were missed. The server answers with `mode: 'full'`
    and the client reloads the snapshot through REST.
  - otherwise `mode: 'delta'`: the server replays the log after `lastSeq - REPLAY_OVERLAP`.
- Replay coalesces per lead (the highest `seq` wins), applies the user's subscription filters and
  splits the result into batches of at most `REPLAY_CHUNK_SIZE` leads.
- Applying a lead on the client is idempotent and ignores a version whose `seq` is not newer.

### Why the overlap

An autoincrement value is allocated when a transaction starts, but the row becomes visible when it
commits. Two concurrent ingestion transactions can therefore commit out of order: seq 105 can be
visible before seq 104. A client that saw 105 and asks for "everything after 105" would never receive 104. Replaying from `lastSeq - 100` re-reads that window. Re-delivery is harmless because applying is
idempotent.

The overlap is a constant, not a proof: a transaction that stays open longer than 100 sequence numbers
of traffic could still be missed, and the next full resync repairs it.

## Consequences

- Reconnecting after a short outage transfers only the changed leads.
- A client more than `maxGap` events behind pays for a full snapshot. That is intentional: replay cost
  grows with the gap, the snapshot cost does not.
- Delta replay re-sends up to 100 sequence numbers of already-seen leads on every resync.
- A lead that stops matching a subscription (for example its score falls below the minimum) is not
  retracted from clients that already hold it; the stream only sends matches. Tracked in
  `docs/TODO.md`.
- Synthetic load test events use sequence numbers above one billion and are not in the log, so the
  load test does not exercise resync.
