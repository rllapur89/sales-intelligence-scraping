import {
  NOTE_MAX_LENGTH,
  PIPELINE_STAGES,
  TASK_TITLE_MAX_LENGTH,
  isTaskOverdue,
  type ActivityDto,
  type PipelineStage,
  type TaskDto,
} from '@leads/shared';

/** Pure view helpers of the CRM UI (validation messages, due dates, activity wording, initials). */

export function noteBodyError(raw: string): string | null {
  const body = raw.trim();
  if (body === '') return 'Write something before saving the note.';
  if (body.length > NOTE_MAX_LENGTH) return `A note can have at most ${NOTE_MAX_LENGTH} characters.`;
  return null;
}

export function taskTitleError(raw: string): string | null {
  const title = raw.trim();
  if (title === '') return 'Give the task a title.';
  if (title.length > TASK_TITLE_MAX_LENGTH) {
    return `A title can have at most ${TASK_TITLE_MAX_LENGTH} characters.`;
  }
  return null;
}

/** `YYYY-MM-DD` from a date input to an ISO instant: the end of that day in local time. */
export function dueDateToIso(date: string): string | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) return null;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const local = new Date(year, month - 1, day, 23, 59, 59, 0);
  if (local.getMonth() !== month - 1 || local.getDate() !== day) return null;
  return local.toISOString();
}

/** Local `YYYY-MM-DD` for a date input; empty when there is no due date. */
export function isoToDueDate(iso: string | null): string {
  if (!iso) return '';
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (n: number): string => String(n).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
}

export type DueState = 'overdue' | 'today' | 'upcoming' | 'none';

/** Done tasks and tasks without a due date have no due state. */
export function dueState(task: Pick<TaskDto, 'dueAt' | 'doneAt'>, now: Date): DueState {
  if (task.doneAt !== null || task.dueAt === null) return 'none';
  if (isTaskOverdue(task, now)) return 'overdue';
  return isoToDueDate(task.dueAt) === isoToDueDate(now.toISOString()) ? 'today' : 'upcoming';
}

export interface CrmIdentity {
  id: string;
  displayName: string;
}

/**
 * One-letter badge for the Kanban card. The API has no user directory, so only the current user is
 * known by name; any other owner shows `?`. Unassigned leads show nothing.
 */
export function assigneeInitial(
  assigneeId: string | null | undefined,
  me: CrmIdentity | null
): string | null {
  if (!assigneeId) return null;
  if (me && assigneeId === me.id) return (me.displayName.trim()[0] ?? '?').toUpperCase();
  return '?';
}

export function assigneeLabel(assigneeId: string | null | undefined, meId: string | null): string {
  if (!assigneeId) return 'Unassigned';
  return assigneeId === meId ? 'Assigned to you' : 'Assigned to a teammate';
}

export function actorLabel(actorId: string | null, meId: string | null): string {
  if (actorId === null) return 'System';
  return actorId === meId ? 'You' : 'A teammate';
}

const isStage = (value: unknown): value is PipelineStage =>
  typeof value === 'string' && (PIPELINE_STAGES as readonly string[]).includes(value);

/** One line for the timeline. Reads ids and enum values only; there is no free text to show. */
export function describeActivity(activity: ActivityDto, meId: string | null): string {
  const data = activity.data;
  switch (activity.type) {
    case 'stage_changed':
      return isStage(data['from']) && isStage(data['to'])
        ? `Stage changed from ${data['from']} to ${data['to']}`
        : 'Stage changed';
    case 'note_added':
      return 'Note added';
    case 'assigned': {
      const to = data['to'];
      if (typeof to !== 'string' || to === '') return 'Lead unassigned';
      return to === meId ? 'Lead assigned to you' : 'Lead assigned to a teammate';
    }
    case 'task_created':
      return 'Task created';
    case 'task_completed':
      return 'Task completed';
    default:
      return 'Activity';
  }
}
