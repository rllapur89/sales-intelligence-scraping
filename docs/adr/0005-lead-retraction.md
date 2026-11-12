# ADR 0005: Lead retraction

Status: accepted

## Context

The hub filters every lead event by the user's subscriptions and sends only matches (ADR 0003). A
lead that matched, was delivered, and later stops matching (score drops below the minimum, the
industry changes, the subscription is edited) produces no match any more, so nothing is sent and the
client keeps showing a lead the user asked not to see. The server must say "drop this one", which
means it must know what each socket already has.

## Decision

- New server-to-client event `leads:retracted { leadIds, seq }`.
- The hub keeps, per socket, a **bounded set of delivered lead ids** (`BoundedIdSet`, default 50,000,
  oldest dropped first, re-delivery refreshes an id).
- A pure planner (`planDispatch`) turns a coalesced window plus the held set and the user's filters
  into deliveries, new matches and retractions. The hub applies the plan to the held set.
- Retractions go through the same per-socket outbox as batches. While a socket is congested the
  latest state per lead id wins (retraction replaces pending delivery, delivery cancels pending
  retraction), so a slow client cannot make the server accumulate retractions.
- Resync: `full` clears the held set, `delta` keeps it and adds what it delivers.
- The same plan drives notifications (new matches and retractions), handed to
  `NotificationsService` fire and forget, one call per user and window.
- Desktop: a `Retract Leads` action removes the leads (live mode), ignoring a retraction older than
  the held version of a lead; clearing a retracted selection shows a toast.

## Consequences

- **Memory**: at most 50,000 ids per socket (about a few MB) on the instance that holds the socket,
  independent of traffic. When the limit evicts an id that lead can no longer be retracted for that
  socket; the cost of the bound is a stale row until the next snapshot.
- **Multi-instance**: every instance receives every event from Redis and tracks only its own
  sockets, so retraction needs no coordination. Notifications are created by every instance that
  has a socket of the user; the 24 h dedupe is a read then insert, so a rare duplicate is possible
  and accepted over adding a unique key or a lock.
- **Resync**: the held set describes what the server sent, not what the client has. After a reconnect
  (new socket, empty set) or a `full` resync leads are only retractable once delivered again. A
  `delta` resync does not retract leads that stopped matching during the outage, because the replay
  is filtered like a live batch.
- A user with no active subscription gets everything retracted, which matches "no subscriptions =
  nothing" of ADR 0003.
- Cost per window grows with sockets x window size (one pass of set lookups), the same order as the
  existing filtering.
- Retraction is best effort: the REST snapshot is the source of truth and repairs any drift.
