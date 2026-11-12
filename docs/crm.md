# CRM: notes, tasks, activity, owner

A light CRM layer over the leads: notes, tasks, an activity timeline and a lead owner. Leads are
companies, so the system never stores personal data in its own fields. Notes and task titles are free
text typed by users; the activity `data` only holds ids and enum values.

All endpoints require a Bearer token (global `JwtAuthGuard`). Roles are `admin` and `user`.
DTOs live in `packages/shared/src/crm.ts` and are shared by the API and the desktop.

## Data model

Migration: `packages/db/prisma/migrations/20260201000000_crm/migration.sql` (hand written to match
the Prisma conventions of the earlier migrations; apply it with `npm run migrate:deploy -w @leads/db`).

| Model / column    | Fields                                                                                                 |
| ----------------- | ------------------------------------------------------------------------------------------------------ |
| `Lead.assigneeId` | nullable owner (`User`). `ON DELETE SET NULL`: deleting a user unassigns leads, it never deletes them. |
| `LeadNote`        | `id`, `leadId`, `authorId`, `body` (max 2000 chars, validated in the API), `createdAt`                 |
| `LeadTask`        | `id`, `leadId`, `createdById`, `assigneeId?`, `title` (max 200), `dueAt?`, `doneAt?`, `createdAt`      |
| `LeadActivity`    | `id`, `leadId`, `actorId?`, `type` (`ActivityType`), `data` JSON default `{}`, `createdAt`             |

Delete behavior: notes, tasks and activities cascade with their lead (never the other way round).
`LeadNote.authorId` and `LeadTask.createdById` are `RESTRICT`, so a user with CRM history cannot be
deleted by accident; `LeadTask.assigneeId` and `LeadActivity.actorId` are `SET NULL`.

Indexes: `LeadNote (leadId, createdAt desc)`, `LeadTask (leadId, createdAt desc)`,
`LeadTask (assigneeId, doneAt, dueAt)` (My tasks), `LeadActivity (leadId, createdAt desc, id desc)`
(keyset pagination), `Lead (assigneeId)`.

`LeadDto` gets an optional `assigneeId?: string | null`. It is absent in payloads that do not select
the column (for example the live feed snapshots written by workers), so existing consumers keep
working.

## Endpoints

| Endpoint                                | Body / query                                | Response                                                   |
| --------------------------------------- | ------------------------------------------- | ---------------------------------------------------------- |
| `GET /api/leads/:id/notes`              | none                                        | `NoteDto[]`, newest first, latest 200                      |
| `POST /api/leads/:id/notes`             | `{ body }` (1-2000 chars after trimming)    | `NoteDto` (201)                                            |
| `DELETE /api/leads/:id/notes/:noteId`   | none                                        | 204                                                        |
| `GET /api/leads/:id/activity`           | `limit` (1-200, default 50), `cursor`       | `Page<ActivityDto>`, newest first                          |
| `GET /api/leads/:id/tasks`              | none                                        | `TaskDto[]`, open first (due first, nulls last), then done |
| `POST /api/leads/:id/tasks`             | `{ title, dueAt?, assigneeId? }`            | `TaskDto` (201)                                            |
| `PATCH /api/tasks/:id`                  | `{ title?, dueAt?: string \| null, done? }` | `TaskDto`                                                  |
| `GET /api/tasks/mine`                   | none                                        | `MyTaskDto[]` (task + `companyName`)                       |
| `PATCH /api/leads/:id/assignee`         | `{ assigneeId: string \| null }`            | `LeadDto`                                                  |
| `PATCH /api/leads/:id/stage` (existing) | `{ stage }`                                 | `LeadDto`, now also records `stage_changed`                |

Error behavior: `404` for an unknown lead, note (also a note of another lead) or task; `403` when
deleting a note you did not write (unless admin); `400` for validation errors (blank or too long
body/title, bad ISO date, unknown fields, invalid cursor) and for an `assigneeId` that is not a user.

Rules:

- Note body and task title are trimmed; empty after trimming is rejected; limits are 2000 and 200.
- `POST .../tasks`: `assigneeId` omitted means the creator, `null` means unassigned. `dueAt` is an
  ISO-8601 string.
- `PATCH /tasks/:id`: `done: true` sets `doneAt` once (completing a done task is a no-op and records
  nothing); `done: false` reopens; `dueAt: null` clears the due date. Any authenticated user may edit
  a task.
- `GET /tasks/mine`: open tasks assigned to the caller ordered by `dueAt` ascending with nulls last,
  then oldest created, then id. Capped at 200.
- Assigning the current owner again, or setting the stage a lead already has, changes nothing and
  records no activity.
- Activity pagination is keyset on `(createdAt desc, id desc)`; the cursor is the opaque cursor of
  `common/cursor.ts` (kind `created`), and a cursor from another listing answers `400`.

## Permissions

| Action                      | Who                                  |
| --------------------------- | ------------------------------------ |
| Read notes, tasks, activity | any authenticated user               |
| Add a note, create a task   | any authenticated user               |
| Delete a note               | its author or an `admin`, else `403` |
| Edit/complete a task        | any authenticated user               |
| Assign a lead               | any authenticated user               |

## Activity types

Stored as the Prisma enum `ActivityType` and exposed in lowercase with underscores. `data` carries ids
and enum values only, never note or task text.

| Type             | Recorded when                               | `data`                              |
| ---------------- | ------------------------------------------- | ----------------------------------- |
| `stage_changed`  | the stage really changes (same transaction) | `{ from, to }` (pipeline stages)    |
| `note_added`     | a note is created                           | `{ noteId }`                        |
| `assigned`       | the owner changes or is cleared             | `{ from, to }` (user ids or `null`) |
| `task_created`   | a task is created                           | `{ taskId, assigneeId }`            |
| `task_completed` | an open task is marked done                 | `{ taskId }`                        |

Notes, tasks and the assignment are written together with their activity in one transaction.

## Code layout

- API: `apps/api/src/crm/`. Pure rules and builders in `crm-rules.ts` (validation, delete permission,
  activity drafts, task patch, orderings, activity cursor); thin services (`notes`, `tasks`,
  `activity`, `assignee`) tested with a mocked Prisma; `crm.controller.ts` holds both controllers.
- Shared: `packages/shared/src/crm.ts` (DTOs, mappers, `isTaskOverdue`, `compareMyTasks`).
- Desktop: `core/data/crm.data-source.ts` (abstract `CrmDataSource`, `MockCrmDataSource` in memory,
  `LiveCrmDataSource` over REST, registered in `data-sources.provider.ts`), `core/crm/` (pure view
  helpers and the per-lead `LeadCrmState`), `shared/components/crm/` (lead panel and My tasks card).

## Desktop UI

- **Lead detail** has a CRM section with an owner row and Notes, Activity and Tasks tabs (ARIA
  `tablist`, arrow keys, labelled fields, loading / empty / error states with retry). Authors and
  admins can delete notes; tasks have a due date and an overdue label (not only color).
- **Owner**: the API has no user directory endpoint, so the UI can only assign to **me** or unassign.
  Other owners are shown as "a teammate".
- **Dashboard** shows "My tasks" (due first, overdue highlighted, tick to complete).
- **Kanban cards** show the owner initial (`?` for another user's leads).
- **Mock mode** keeps everything in memory for the session (no backend). Stage changes made in mock
  mode do not create activity entries because the mock stage change is local.

## Not covered yet

- No user list endpoint, so no assignee picker; no task reminders or notifications.
- The live lead feed (Socket.IO snapshots) does not carry `assigneeId`; the desktop merges lead
  updates, so an owner set in the UI survives live updates, but another user's assignment is only
  seen after a reload.
