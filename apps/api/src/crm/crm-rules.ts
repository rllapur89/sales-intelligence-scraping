import { BadRequestException, ForbiddenException } from '@nestjs/common';
import type { Prisma } from '@leads/db';
import {
  NOTE_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  toDbActivityType,
  type ActivityType,
  type PipelineStage,
  type UserRole,
} from '@leads/shared';
import { decodeCursor, encodeCursor } from '../common/cursor';

/** Pure CRM rules: validation, permissions, activity payloads and task patches. No IO. */

export const NOTE_EMPTY_MESSAGE = 'Note body must not be empty';
export const NOTE_TOO_LONG_MESSAGE = `Note body must be at most ${NOTE_MAX_LENGTH} characters`;
export const TASK_TITLE_EMPTY_MESSAGE = 'Task title must not be empty';
export const TASK_TITLE_TOO_LONG_MESSAGE = `Task title must be at most ${TASK_TITLE_MAX_LENGTH} characters`;
export const NOTE_FORBIDDEN_MESSAGE = 'Only the author or an admin can delete this note';

/** Trims the note body; rejects empty and over-long text (counted after trimming). */
export function validateNoteBody(raw: string): string {
  const body = raw.trim();
  if (body === '') throw new BadRequestException(NOTE_EMPTY_MESSAGE);
  if (body.length > NOTE_MAX_LENGTH) throw new BadRequestException(NOTE_TOO_LONG_MESSAGE);
  return body;
}

export function validateTaskTitle(raw: string): string {
  const title = raw.trim();
  if (title === '') throw new BadRequestException(TASK_TITLE_EMPTY_MESSAGE);
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    throw new BadRequestException(TASK_TITLE_TOO_LONG_MESSAGE);
  }
  return title;
}

export function canDeleteNote(
  actor: { id: string; role: UserRole },
  note: { authorId: string },
): boolean {
  return actor.role === 'admin' || note.authorId === actor.id;
}

export function assertCanDeleteNote(
  actor: { id: string; role: UserRole },
  note: { authorId: string },
): void {
  if (!canDeleteNote(actor, note)) throw new ForbiddenException(NOTE_FORBIDDEN_MESSAGE);
}

/** An activity ready to insert (minus lead and actor). `data` only ever holds ids and enum values. */
export interface ActivityDraft {
  type: ActivityType;
  data: Record<string, string | null>;
}

const draft = (type: ActivityType, data: ActivityDraft['data']): ActivityDraft => ({ type, data });

export const stageChangedActivity = (from: PipelineStage, to: PipelineStage): ActivityDraft =>
  draft('stage_changed', { from, to });

export const noteAddedActivity = (noteId: string): ActivityDraft => draft('note_added', { noteId });

export const assignedActivity = (from: string | null, to: string | null): ActivityDraft =>
  draft('assigned', { from, to });

export const taskCreatedActivity = (taskId: string, assigneeId: string | null): ActivityDraft =>
  draft('task_created', { taskId, assigneeId });

export const taskCompletedActivity = (taskId: string): ActivityDraft =>
  draft('task_completed', { taskId });

/** Prisma `create` payload for a draft. */
export function toActivityCreate(
  leadId: string,
  actorId: string | null,
  activity: ActivityDraft,
): Prisma.LeadActivityUncheckedCreateInput {
  return {
    leadId,
    actorId,
    type: toDbActivityType(activity.type) as Prisma.LeadActivityUncheckedCreateInput['type'],
    data: activity.data,
  };
}

export interface TaskPatchInput {
  title?: string;
  dueAt?: string | null;
  done?: boolean;
}

export interface TaskPatchResult {
  data: Prisma.LeadTaskUpdateInput;
  /** True only when an open task becomes done, which is what records `task_completed`. */
  completed: boolean;
}

/** Builds the update for PATCH /tasks/:id; absent fields stay untouched, redoing a state is a no-op. */
export function buildTaskPatch(
  existing: { doneAt: Date | null },
  patch: TaskPatchInput,
  now: Date,
): TaskPatchResult {
  const data: Prisma.LeadTaskUpdateInput = {};
  let completed = false;
  if (patch.title !== undefined) data.title = validateTaskTitle(patch.title);
  if (patch.dueAt !== undefined) data.dueAt = patch.dueAt === null ? null : new Date(patch.dueAt);
  if (patch.done === true && existing.doneAt === null) {
    data.doneAt = now;
    completed = true;
  } else if (patch.done === false && existing.doneAt !== null) {
    data.doneAt = null;
  }
  return { data, completed };
}

/** Open tasks first by due date (nulls last), then oldest created, then id: see `compareMyTasks`. */
export const MY_TASKS_ORDER_BY: Prisma.LeadTaskOrderByWithRelationInput[] = [
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'asc' },
  { id: 'asc' },
];

/** Tasks of one lead: open ones first (by due date, nulls last), then done ones, newest first. */
export const LEAD_TASKS_ORDER_BY: Prisma.LeadTaskOrderByWithRelationInput[] = [
  { doneAt: { sort: 'desc', nulls: 'first' } },
  { dueAt: { sort: 'asc', nulls: 'last' } },
  { createdAt: 'desc' },
  { id: 'desc' },
];

/** Newest first, id as tie-breaker (matches the (leadId, createdAt desc, id desc) index). */
export const ACTIVITY_ORDER_BY: Prisma.LeadActivityOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

export function activityCursorFor(row: { id: string; createdAt: Date }): string {
  return encodeCursor('created', { value: row.createdAt.toISOString(), id: row.id });
}

/** Rows strictly after the cursor in newest-first order. */
export function buildActivityPageWhere(
  leadId: string,
  cursor?: string,
): Prisma.LeadActivityWhereInput {
  if (!cursor) return { leadId };
  const pos = decodeCursor(cursor, 'created');
  const at = new Date(pos.value as string);
  return {
    leadId,
    OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: pos.id } }],
  };
}
