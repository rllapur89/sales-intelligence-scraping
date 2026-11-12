/**
 * CRM DTOs (notes, tasks, activity) and the pure row mappers behind them. Dates travel as ISO-8601
 * strings. Notes and task titles are free text typed by users; system fields (activity `data`) only
 * hold ids and enum values, never personal data.
 */

export const NOTE_MAX_LENGTH = 2000;
export const TASK_TITLE_MAX_LENGTH = 200;

export const ACTIVITY_TYPES = [
  'stage_changed',
  'note_added',
  'assigned',
  'task_created',
  'task_completed',
] as const;
export type ActivityType = (typeof ACTIVITY_TYPES)[number];

export interface NoteDto {
  id: string;
  leadId: string;
  authorId: string;
  body: string;
  createdAt: string;
}

export interface TaskDto {
  id: string;
  leadId: string;
  createdById: string;
  assigneeId: string | null;
  title: string;
  dueAt: string | null;
  doneAt: string | null;
  createdAt: string;
}

/** A task as listed in "My tasks": it also carries the company it belongs to. */
export interface MyTaskDto extends TaskDto {
  companyName: string;
}

export interface ActivityDto {
  id: string;
  leadId: string;
  actorId: string | null;
  type: ActivityType;
  /** Ids and enum values only (for example `{ from: 'new', to: 'won' }`); never free text. */
  data: Record<string, unknown>;
  createdAt: string;
}

export interface DbNoteRow {
  id: string;
  leadId: string;
  authorId: string;
  body: string;
  createdAt: Date;
}

export interface DbTaskRow {
  id: string;
  leadId: string;
  createdById: string;
  assigneeId: string | null;
  title: string;
  dueAt: Date | null;
  doneAt: Date | null;
  createdAt: Date;
}

export interface DbActivityRow {
  id: string;
  leadId: string;
  actorId: string | null;
  /** Prisma enum, `STAGE_CHANGED`. */
  type: string;
  data: unknown;
  createdAt: Date;
}

/** `STAGE_CHANGED` -> `stage_changed`. Unlike other enums the activity types keep underscores. */
export const fromDbActivityType = (type: string): ActivityType =>
  type.toLowerCase() as ActivityType;

export const toDbActivityType = (type: ActivityType): string => type.toUpperCase();

export function toNoteDto(row: DbNoteRow): NoteDto {
  return {
    id: row.id,
    leadId: row.leadId,
    authorId: row.authorId,
    body: row.body,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toTaskDto(row: DbTaskRow): TaskDto {
  return {
    id: row.id,
    leadId: row.leadId,
    createdById: row.createdById,
    assigneeId: row.assigneeId,
    title: row.title,
    dueAt: row.dueAt?.toISOString() ?? null,
    doneAt: row.doneAt?.toISOString() ?? null,
    createdAt: row.createdAt.toISOString(),
  };
}

export function toMyTaskDto(row: DbTaskRow & { lead: { company: { name: string } } }): MyTaskDto {
  return { ...toTaskDto(row), companyName: row.lead.company.name };
}

function toDataRecord(data: unknown): Record<string, unknown> {
  return data !== null && typeof data === 'object' && !Array.isArray(data)
    ? (data as Record<string, unknown>)
    : {};
}

export function toActivityDto(row: DbActivityRow): ActivityDto {
  return {
    id: row.id,
    leadId: row.leadId,
    actorId: row.actorId,
    type: fromDbActivityType(row.type),
    data: toDataRecord(row.data),
    createdAt: row.createdAt.toISOString(),
  };
}

/** Open task is overdue when it has a due date in the past and is not done. */
export function isTaskOverdue(task: Pick<TaskDto, 'dueAt' | 'doneAt'>, now: Date): boolean {
  return task.doneAt === null && task.dueAt !== null && Date.parse(task.dueAt) < now.getTime();
}

/**
 * "My tasks" order: earliest due date first, tasks without a due date last, then oldest created,
 * then id so the order is total and stable. Mirrors the API query ordering.
 */
export function compareMyTasks(
  a: Pick<TaskDto, 'id' | 'dueAt' | 'createdAt'>,
  b: Pick<TaskDto, 'id' | 'dueAt' | 'createdAt'>,
): number {
  if (a.dueAt !== b.dueAt) {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    const byDue = Date.parse(a.dueAt) - Date.parse(b.dueAt);
    if (byDue !== 0) return byDue;
  }
  const byCreated = Date.parse(a.createdAt) - Date.parse(b.createdAt);
  if (byCreated !== 0) return byCreated;
  return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
}
