# Offline snapshot cache

The desktop app (live mode) keeps the **last snapshot of leads** so it opens with data while it
reconnects to the API. Mock mode does not use the cache.

## What is cached

One record, `{ version: 1, savedAt, lastSeq, leads }`, in IndexedDB (database
`leads-sales-intelligence`, store `snapshot`) of the Electron renderer / browser.

- `leads`: the current leads of the store.
- `lastSeq`: the last applied event sequence number. After a reconnect it lets the socket ask for a
  delta (`leads:resync`) instead of a full reload.

## Flow

1. **Startup**: while the REST snapshot is pending, the cached snapshot is loaded into the store
   (`loadLeadsFromCache`), so the grid shows data immediately. The REST snapshot then replaces it.
   If REST (or the socket's resync) answers first, the cache is ignored.
2. **Save**: right after `loadLeadsSuccess`, and 5 s after the last live batch (debounce,
   `snapshotSaveDebounceMs`).
3. **REST fails with a cache on screen**: the cached data stays, no error state is shown, and a toast
   says "Offline: showing the last saved data".

## Limits

| Limit    | Value                                                                                 | Where                          |
| -------- | ------------------------------------------------------------------------------------- | ------------------------------ |
| Size cap | the `snapshotMaxLeads` highest-score leads (20,000)                                   | `environment*.ts`, `capLeads`  |
| Max age  | 7 days (`snapshotMaxAgeMs`); older snapshots are ignored and deleted                  | `isSnapshotUsable`             |
| Format   | other `version`, bad shape or corrupt data are ignored and deleted                    | `isSnapshotUsable`             |
| Per user | cleared when the session ends (logout, failed token refresh) or another user signs in | `provideSnapshotCacheClearing` |

A cached snapshot can be stale, and when the leads exceed the cap only the best-scoring ones are
kept; the REST snapshot is always authoritative once it arrives.

## Failure handling

The storage never throws into the app. If IndexedDB is missing, blocked or full, the error is logged
with `console.warn` and the app continues without a cache. Without IndexedDB (tests, SSR) an
in-memory storage is used.

## Not cached

- Scraping jobs, metrics, subscriptions and the dashboard charts.
- UI state: filters, selection, scroll position.
- Auth tokens (kept separately in `localStorage` by `AuthService`).
- Lead edits made while offline: stage changes still need the API and are rolled back on failure.

## Code map

`apps/desktop/src/app/core/cache/` (`snapshot.helpers.ts`, `snapshot-storage.ts`,
`indexeddb-snapshot-storage.ts`, `snapshot-cache.service.ts`) and the `hydrateFromCache$`,
`offlineFallbackToast$` and `saveSnapshot$` effects in `core/store/leads/leads.effects.ts`.
