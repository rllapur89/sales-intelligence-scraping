# Analytics

Five read-only reports over the leads, served by the API and shown in the desktop **Reports** page.
All endpoints require a Bearer token like the rest of the API (global `JwtAuthGuard`).

Shapes are declared in `packages/shared/src/analytics.ts`. The same pure functions (`buildFunnel`,
`buildBreakdown`, `buildSignalMix`, `buildScoreTrend`) build the responses in the API and in the
desktop mock mode, so both produce identical shapes.

## Endpoints

| Endpoint                         | Query                           | Response        |
| -------------------------------- | ------------------------------- | --------------- |
| `GET /api/analytics/funnel`      | none                            | `FunnelDto`     |
| `GET /api/analytics/by-source`   | none                            | `BreakdownDto`  |
| `GET /api/analytics/by-industry` | none                            | `BreakdownDto`  |
| `GET /api/analytics/signals`     | none                            | `SignalMixDto`  |
| `GET /api/analytics/score-trend` | `days` integer 1-90, default 30 | `ScoreTrendDto` |

An invalid `days` (0, 91, `abc`, `2.5`) or an unknown query parameter answers `400`.

### Shapes

```ts
FunnelDto     { stages: { stage, count, conversionFromPrevious }[] }
BreakdownDto  { items: { key, label, count, avgScore }[] }
SignalMixDto  { items: { type, count }[] }
ScoreTrendDto { days: number, points: { date, newLeads, avgScore }[] }
```

- **Funnel**: stages `new, contacted, qualified, proposal, won`. `count` is cumulative: leads that
  reached that stage or a later one. Lost leads entered the funnel but their last stage is unknown,
  so they only add to `new`. `conversionFromPrevious` is a percentage with one decimal (`100` for the
  first stage when it has leads, `0` when the previous stage is empty).
- **By source**: leads with at least one signal from the source (a lead can appear under several
  sources) and their average score. `label` is the display name (`HN Hiring`, `SEC EDGAR`, ...).
  Sources without leads are omitted.
- **By industry**: leads per `Company.industry`; a missing industry is `key: "unknown"`,
  `label: "Unknown"`. Breakdowns are sorted by `count` desc, then key, and capped at 12 items.
- **Signals**: number of stored signals per type, every type present (zero-filled), biggest first.
- **Score trend**: exactly `days` points, oldest first, one per UTC day ending today (`YYYY-MM-DD`),
  zero-filled (`newLeads: 0, avgScore: 0`) for days without new leads. `avgScore` has one decimal.

`avgScore` is always rounded to one decimal and is `0` for an empty group.

## How the API computes them

`AnalyticsService` stays thin: Prisma aggregates in, shared pure functions out
(`apps/api/src/analytics/`).

- funnel: `lead.groupBy({ by: ['stage'] })`
- by-industry: `lead.groupBy({ by: ['industry'], _count, _avg: { score } })`
- by-source: one `lead.aggregate` per source (count and average score of leads whose company has a
  signal from it)
- signals: `signal.groupBy({ by: ['type'] })`
- score-trend: a single `$queryRaw` with `Prisma.sql` that buckets `Lead.createdAt` by UTC day. It is
  the only raw SQL; the window start is a bound parameter and nothing from the request is
  concatenated into the SQL.

## Desktop

`features/reports` shows the funnel, by-source, by-industry, signal mix and score trend (new leads
per day and average score per day) as hand-written SVG/CSS charts
(`shared/components/charts`, no chart dependency).

- Range selector: 7 / 30 / 90 days. Only the score trend depends on the range, the other four
  reports describe all leads.
- Each report has loading, error (with Retry; one failing report does not affect the others) and
  empty states, and a collapsible **View as table** with the same numbers as the chart.
- **Export**: CSV and JSON buttons per report, built by the pure helpers in `core/util/export.ts`
  from the report table. CSV reuses `csvField`, which escapes RFC 4180 fields and neutralises
  formulas (`=`, `+`, `-`, `@`). Files are named `salesintel-<report>-<YYYY-MM-DD>.<csv|json>`.

### Mock mode

With `dataMode: 'mock'` the `AnalyticsDataSource` is `MockAnalyticsDataSource`: it computes every
report from `MockDataService.getLeads()` (`core/analytics/mock-analytics.ts`) with the shared
functions above, no backend needed. Mock leads carry no source and no creation date, so two
approximations apply:

- the source of a signal is the one that normally produces its type: hiring -> Greenhouse,
  filing -> SEC EDGAR, oss-activity -> GitHub, funding -> HN Hiring, website-tech -> Website;
- "new leads" per day are counted by `updatedAt`.

In live mode `LiveAnalyticsDataSource` calls the endpoints above.
