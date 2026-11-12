# Alerts: lead retraction and notifications

Two features on top of the live stream (ADR 0003, 0004):

- **Retraction**: a socket is told when a lead it holds stops matching its user's subscriptions.
- **Notifications**: an in-app notification when a lead newly matches a subscription with `notify`
  on, and when such a lead is retracted.

Leads are companies: a notification only carries the lead id and the company name (`title`), never
personal data. Design rationale and costs: [ADR 0005](./adr/0005-lead-retraction.md).

## Event contract

Socket.IO, server to client (declared in `packages/shared/src/events.ts`):

| Event             | Payload                              | Meaning                                                                   |
| ----------------- | ------------------------------------ | ------------------------------------------------------------------------- |
| `leads:batch`     | `LeadBatch`                          | Latest version per lead that matches the user's filters (unchanged).      |
| `leads:retracted` | `{ leadIds: string[]; seq: number }` | These leads no longer match: remove them. `seq` = last seq of the window. |

`seq` is the highest event sequence of the dispatch window that caused the retraction, so the client
can advance `lastSeq` like it does for a batch. A client must treat a retraction as stale for a lead
it holds with a higher `seq` (the desktop does).

## Held-set semantics

The hub keeps, per socket, the set of lead ids it **delivered** and did not retract since (`held`).
For every coalesced window, per socket (`planDispatch` in `realtime/retraction-planner.ts`):

| Lead in the window         | Held before | Result                                                |
| -------------------------- | ----------- | ----------------------------------------------------- |
| matches the user's filters | no          | delivered, added to `held`, counts as a **new match** |
| matches the user's filters | yes         | delivered (update), stays held                        |
| does not match             | yes         | **retraction**, removed from `held`                   |
| does not match             | no          | nothing (the client never saw it)                     |

A user with no active subscription matches nothing, so every held lead is retracted.

- **Bound**: `held` holds at most 50,000 ids per socket (`GATEWAY_HELD_LIMIT`, default 50000); the
  oldest id is dropped first and re-delivery refreshes an id. A dropped id can no longer be
  retracted; the lead stays on that client until its next snapshot.
- **Backpressure**: retractions use the same per-socket outbox as batches. While a socket is
  congested, per lead id the latest state wins: a retraction replaces a pending delivery, and a
  delivery cancels a pending retraction. Pending state is at most one entry per lead id.
- **Resync**: a `full` resync clears `held` (the client reloads its snapshot); a `delta` resync keeps
  `held` and adds the ids it delivers. A reconnect is a new socket and starts with an empty `held`.
- **Desktop**: `leads:retracted` becomes the `Retract Leads` store action (live mode). The leads are
  removed, dropped from the bulk selection and not flashed. If the selected lead is removed the
  selection is cleared and a toast says it no longer matches.

## Notifications

### Rules

- A lead **newly matching** a socket (it was not held) creates a `new_match` notification when the
  user has an active subscription with `notify = true` that matches it **and** `score >= 70`.
- At most **one `new_match` per user and lead per 24 hours** (rolling window, database backed).
- A **retraction** creates a `retracted` notification only if the user's latest notification for
  that lead is a `new_match` (so a second retraction in a row is dropped).
- Creation is fire and forget: the hub never waits for it, errors are logged and swallowed, and the
  work is batched per user and dispatch window (several sockets of one user make one call).

Pure rules: `apps/api/src/notifications/notification-rules.ts`. Constants live in
`packages/shared/src/notifications.ts`.

### Data model

Migration `packages/db/prisma/migrations/20260202000000_notifications/migration.sql` (hand written;
apply it with `npm run migrate:deploy -w @leads/db`).

| Model / column        | Fields                                                                                         |
| --------------------- | ---------------------------------------------------------------------------------------------- |
| `Subscription.notify` | `Boolean`, default `false`                                                                     |
| `Notification`        | `id`, `userId`, `type` (`NEW_MATCH` or `RETRACTED`), `leadId`, `title`, `createdAt`, `readAt?` |

Both foreign keys cascade. Indexes: `(userId, createdAt desc, id desc)` for the keyset list,
`(userId, readAt)` for the unread count, `(userId, leadId, type, createdAt desc)` for dedupe.

### REST (Bearer token, the caller's own rows only)

| Method and path                       | Notes                                                                                                                                                      |
| ------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `GET /api/notifications`              | Keyset pagination, newest first (`limit` 1-200, default 50, `cursor`, `unreadOnly=true`)                                                                   |
| `GET /api/notifications/unread-count` | `{ count }`                                                                                                                                                |
| `POST /api/notifications/read`        | Body `{ ids?: string[] (max 200), all?: boolean }` -> `{ updated }`. 400 if neither `ids` (non-empty) nor `all: true`. Foreign or unknown ids are ignored. |

Subscriptions: `POST`/`PATCH /api/subscriptions` accept `notify` (boolean, default `false`) and
`SubscriptionDto` returns it.

### Desktop

Live mode only. The header bell shows the unread count (capped at `99+`) in an `aria-live` badge,
the button's `aria-label` includes the count, and the dropdown supports Arrow keys, Home/End and
Escape. Clicking an item marks it read, selects the lead and opens the leads page; if the lead is
no longer in the list a toast says so. The unread count is polled every 30 s
(`NOTIFICATIONS_POLL_MS`, read from `notificationsPollMs` of the environment when present) and
refreshed 1.5 s after a `leads:retracted`. Mock mode shows an empty state and makes no requests. The
subscriptions editor has a "Notify me about new matches" toggle.

## What is not covered

- Notifications are only created while the user has a socket connected to an API instance: nothing
  is created for offline users, and nothing is back-filled on login.
- A reconnect starts with an empty held set, so a lead that stopped matching while the client was
  offline is not retracted on a `delta` resync (the replay only contains matching leads), and a
  lead the client got from a REST snapshot but never over the socket is not retracted either.
- Several API instances: each keeps its own held sets and sees every event. The 24 h dedupe is read
  then written, so two instances handling the same window for the same user can rarely both insert.
- Unread notifications are not pushed over the socket; the desktop polls.
- No e-mail, push or OS notifications, no per-subscription score threshold (70 is fixed), no
  notification retention or clean-up job.
