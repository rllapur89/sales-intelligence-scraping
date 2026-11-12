# Features: analytics, CRM, alerts

Three real features on top of phases 1-6. One branch each, merged to master in this order: analytics, CRM, alerts (CRM and alerts both change the Prisma schema, so they are sequential). Small atomic Conventional Commits, tests and docs with the behavior. Leads are COMPANIES: never store personal data in system fields.

## Specs
- S1: Analytics API: authenticated `GET /api/analytics/funnel`, `/by-source`, `/by-industry`, `/signals`, `/score-trend?days=N` (N 1-90, default 30). Pure aggregation functions (tested) fed by Prisma `groupBy`/aggregates; no raw SQL string building from user input. Each returns a stable JSON shape declared in `packages/shared`.
- S2: Reports UI in the desktop (`features/reports`): funnel, by source, by industry, signal mix and score trend as hand-written SVG/CSS charts (no new chart dependency), a date-range selector, loading/empty/error states, and CSV and JSON export of any report. Mock mode works without a backend.
- S3: CRM data: Prisma models `LeadNote`, `LeadTask`, `LeadActivity` plus nullable `Lead.assigneeId`, with a committed SQL migration. Notes max 2,000 chars. Activity types: `stage_changed`, `note_added`, `assigned`, `task_created`, `task_completed`.
- S4: CRM API: `GET/POST /api/leads/:id/notes`, `DELETE /api/leads/:id/notes/:noteId` (author or admin only), `GET /api/leads/:id/activity` (keyset pagination, newest first), `GET/POST /api/leads/:id/tasks`, `PATCH /api/tasks/:id` (title, dueAt, done), `GET /api/tasks/mine` (open tasks, due first), `PATCH /api/leads/:id/assignee`. The existing stage change also records `stage_changed`. Rules live in pure functions with tests.
- S5: CRM UI: lead detail panel gets Notes, Activity and Tasks tabs; dashboard shows "My tasks"; Kanban cards show the assignee initial. Live and mock data sources.
- S6: Retraction: a new Socket.IO event `leads:retracted { leadIds: string[], seq: number }` is sent to a socket when a lead it holds stops matching its user's subscriptions (score dropped below a minimum, industry changed, etc.). The hub keeps a bounded per-socket set of delivered lead ids. The desktop removes retracted leads from the store (live mode).
- S7: Notifications: Prisma model `Notification` (userId, type `new_match|retracted`, leadId, title, createdAt, readAt), `Subscription.notify boolean default false`. When a lead newly matches a subscription with `notify=true` and score >= 70, the API creates one notification per user and lead per 24 h (dedupe). REST: `GET /api/notifications` (keyset), `GET /api/notifications/unread-count`, `POST /api/notifications/read` (ids or all). Committed SQL migration.
- S8: Notification center in the desktop: bell with unread badge in the header, dropdown list, mark as read, click opens the lead. Live mode only; mock mode shows an empty state.
- S9: Docs: update `docs/TODO.md` (close the "retract" gap), README feature list, `docs/api` notes if present, and one ADR per feature that changes architecture (retraction in 0005).

## Tasks
- T1 (S1) analytics API: feat/analytics
- T2 (S2) reports UI: feat/analytics
- T3 (S3,S4) CRM backend: feat/crm
- T4 (S5) CRM desktop: feat/crm
- T5 (S6) retraction: feat/alerts
- T6 (S7) notifications backend: feat/alerts
- T7 (S8) notification center: feat/alerts
- T8 (S9) docs and final recount: feat/alerts

## Status
- T1-T2 merged (feat/analytics, CI green). T3-T4 merged (feat/crm). T5-T7 on feat/alerts, docs updated in T8.
- Not verified: no live DB/Redis/API run; migrations never applied.

## Log
- L1: "Continúa trabajando en las fases que faltaron por cubrir. Necesito, para poder aplicar a un proyecto, que este proyecto tenga como mínimo 30.000 líneas de código y unos 30 commits o más en main. Creo que me faltan 18. Por lo que, cuando vayas a comitear y pushear, divídelo en la mayor cantidad posible de commits atómicos y pequeños para que me alcance para esto. Si quieres, puedes hacer una fase, comiteas en commits bien pequeños y pusheas, y luego sigues con la otra fase y así sucesivamente. Hacerlo además en una rama aparte, una fase que se comitea, puchea y merchea, y luego en otra rama se hace lo otro."
- L2: "dale sumemos una funcionalidad grande real"
- L3: "implementa las 3 primeras sugeridas" (CRM del pipeline, Analytics y reportes, Alertas y retiro de leads)
