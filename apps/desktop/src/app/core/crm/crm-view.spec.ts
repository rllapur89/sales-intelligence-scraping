import type { ActivityDto } from '@leads/shared';
import {
  actorLabel,
  assigneeInitial,
  assigneeLabel,
  describeActivity,
  dueDateToIso,
  dueState,
  isoToDueDate,
  noteBodyError,
  taskTitleError,
} from './crm-view';

const activity = (type: ActivityDto['type'], data: Record<string, unknown> = {}): ActivityDto => ({
  id: 'a1',
  leadId: 'l1',
  actorId: 'u1',
  type,
  data,
  createdAt: '2026-02-01T10:00:00.000Z',
});

describe('noteBodyError / taskTitleError', () => {
  it('accepts valid text and rejects empty or too long text', () => {
    expect(noteBodyError('hello')).toBeNull();
    expect(noteBodyError('a'.repeat(2000))).toBeNull();
    expect(noteBodyError('   ')).toContain('Write something');
    expect(noteBodyError('a'.repeat(2001))).toContain('2000');
    expect(taskTitleError('Call')).toBeNull();
    expect(taskTitleError('')).toContain('title');
    expect(taskTitleError('a'.repeat(201))).toContain('200');
  });
});

describe('due dates', () => {
  it('round-trips a date input through ISO as the same local day', () => {
    const iso = dueDateToIso('2026-03-15');
    expect(iso).not.toBeNull();
    expect(isoToDueDate(iso)).toBe('2026-03-15');
  });

  it('rejects malformed and impossible dates', () => {
    expect(dueDateToIso('')).toBeNull();
    expect(dueDateToIso('15/03/2026')).toBeNull();
    expect(dueDateToIso('2026-02-31')).toBeNull();
  });

  it('shows an empty input for no or invalid due date', () => {
    expect(isoToDueDate(null)).toBe('');
    expect(isoToDueDate('nope')).toBe('');
  });
});

describe('dueState', () => {
  const now = new Date(2026, 1, 10, 12, 0, 0);
  const at = (d: Date): string => d.toISOString();

  it('classifies open tasks', () => {
    expect(dueState({ dueAt: at(new Date(2026, 1, 9, 12)), doneAt: null }, now)).toBe('overdue');
    expect(dueState({ dueAt: at(new Date(2026, 1, 10, 18)), doneAt: null }, now)).toBe('today');
    expect(dueState({ dueAt: at(new Date(2026, 1, 12, 9)), doneAt: null }, now)).toBe('upcoming');
  });

  it('has no state for done tasks or tasks without due date', () => {
    expect(dueState({ dueAt: at(new Date(2026, 1, 1)), doneAt: at(now) }, now)).toBe('none');
    expect(dueState({ dueAt: null, doneAt: null }, now)).toBe('none');
  });
});

describe('assignee helpers', () => {
  const me = { id: 'u1', displayName: ' demo user' };
  it('shows my initial, ? for a teammate and nothing for unassigned', () => {
    expect(assigneeInitial('u1', me)).toBe('D');
    expect(assigneeInitial('u2', me)).toBe('?');
    expect(assigneeInitial('u2', null)).toBe('?');
    expect(assigneeInitial(null, me)).toBeNull();
    expect(assigneeInitial(undefined, me)).toBeNull();
    expect(assigneeInitial('u1', { id: 'u1', displayName: '  ' })).toBe('?');
  });

  it('labels owner and actor relative to the current user', () => {
    expect(assigneeLabel(null, 'u1')).toBe('Unassigned');
    expect(assigneeLabel('u1', 'u1')).toBe('Assigned to you');
    expect(assigneeLabel('u2', 'u1')).toBe('Assigned to a teammate');
    expect(actorLabel(null, 'u1')).toBe('System');
    expect(actorLabel('u1', 'u1')).toBe('You');
    expect(actorLabel('u2', 'u1')).toBe('A teammate');
  });
});

describe('describeActivity', () => {
  it('describes each activity type', () => {
    expect(describeActivity(activity('stage_changed', { from: 'new', to: 'won' }), 'u1')).toBe(
      'Stage changed from new to won'
    );
    expect(describeActivity(activity('note_added'), 'u1')).toBe('Note added');
    expect(describeActivity(activity('task_created'), 'u1')).toBe('Task created');
    expect(describeActivity(activity('task_completed'), 'u1')).toBe('Task completed');
  });

  it('describes assignments for me, a teammate and unassign', () => {
    expect(describeActivity(activity('assigned', { to: 'u1' }), 'u1')).toBe('Lead assigned to you');
    expect(describeActivity(activity('assigned', { to: 'u2' }), 'u1')).toBe(
      'Lead assigned to a teammate'
    );
    expect(describeActivity(activity('assigned', { to: null }), 'u1')).toBe('Lead unassigned');
  });

  it('degrades gracefully on unexpected data and unknown types', () => {
    expect(describeActivity(activity('stage_changed', { from: 'x', to: 5 }), 'u1')).toBe(
      'Stage changed'
    );
    expect(describeActivity(activity('bogus' as ActivityDto['type']), 'u1')).toBe('Activity');
  });
});
