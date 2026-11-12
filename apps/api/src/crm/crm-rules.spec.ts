import { BadRequestException, ForbiddenException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import {
  MY_TASKS_ORDER_BY,
  NOTE_EMPTY_MESSAGE,
  NOTE_FORBIDDEN_MESSAGE,
  NOTE_TOO_LONG_MESSAGE,
  TASK_TITLE_EMPTY_MESSAGE,
  TASK_TITLE_TOO_LONG_MESSAGE,
  activityCursorFor,
  assertCanDeleteNote,
  assignedActivity,
  buildActivityPageWhere,
  buildTaskPatch,
  canDeleteNote,
  noteAddedActivity,
  stageChangedActivity,
  taskCompletedActivity,
  taskCreatedActivity,
  toActivityCreate,
  validateNoteBody,
  validateTaskTitle,
} from './crm-rules';

describe('validateNoteBody', () => {
  it('trims and accepts up to 2000 characters', () => {
    expect(validateNoteBody('  hello  ')).toBe('hello');
    expect(validateNoteBody('a'.repeat(2000))).toHaveLength(2000);
  });

  it('rejects empty or whitespace-only text', () => {
    expect(() => validateNoteBody('   ')).toThrow(new BadRequestException(NOTE_EMPTY_MESSAGE));
    expect(() => validateNoteBody('')).toThrow(BadRequestException);
  });

  it('rejects 2001 characters but counts after trimming', () => {
    expect(() => validateNoteBody('a'.repeat(2001))).toThrow(
      new BadRequestException(NOTE_TOO_LONG_MESSAGE),
    );
    expect(validateNoteBody(` ${'a'.repeat(2000)} `)).toHaveLength(2000);
  });
});

describe('validateTaskTitle', () => {
  it('trims and enforces 1-200 characters', () => {
    expect(validateTaskTitle('  Call  ')).toBe('Call');
    expect(validateTaskTitle('a'.repeat(200))).toHaveLength(200);
    expect(() => validateTaskTitle(' ')).toThrow(new BadRequestException(TASK_TITLE_EMPTY_MESSAGE));
    expect(() => validateTaskTitle('a'.repeat(201))).toThrow(
      new BadRequestException(TASK_TITLE_TOO_LONG_MESSAGE),
    );
  });
});

describe('note delete permission', () => {
  const note = { authorId: 'u1' };
  it('allows the author and any admin, nobody else', () => {
    expect(canDeleteNote({ id: 'u1', role: 'user' }, note)).toBe(true);
    expect(canDeleteNote({ id: 'u9', role: 'admin' }, note)).toBe(true);
    expect(canDeleteNote({ id: 'u2', role: 'user' }, note)).toBe(false);
  });

  it('throws 403 with a stable message otherwise', () => {
    expect(() => assertCanDeleteNote({ id: 'u2', role: 'user' }, note)).toThrow(
      new ForbiddenException(NOTE_FORBIDDEN_MESSAGE),
    );
    expect(() => assertCanDeleteNote({ id: 'u1', role: 'user' }, note)).not.toThrow();
  });
});

describe('activity drafts', () => {
  it('build ids and enum values only, never free text', () => {
    expect(stageChangedActivity('new', 'won')).toEqual({
      type: 'stage_changed',
      data: { from: 'new', to: 'won' },
    });
    expect(noteAddedActivity('n1')).toEqual({ type: 'note_added', data: { noteId: 'n1' } });
    expect(assignedActivity(null, 'u2')).toEqual({
      type: 'assigned',
      data: { from: null, to: 'u2' },
    });
    expect(taskCreatedActivity('t1', null)).toEqual({
      type: 'task_created',
      data: { taskId: 't1', assigneeId: null },
    });
    expect(taskCompletedActivity('t1')).toEqual({ type: 'task_completed', data: { taskId: 't1' } });
  });

  it('maps a draft to a Prisma create with the DB enum', () => {
    expect(toActivityCreate('l1', 'u1', noteAddedActivity('n1'))).toEqual({
      leadId: 'l1',
      actorId: 'u1',
      type: 'NOTE_ADDED',
      data: { noteId: 'n1' },
    });
    expect(toActivityCreate('l1', null, stageChangedActivity('new', 'lost')).type).toBe(
      'STAGE_CHANGED',
    );
  });
});

describe('buildTaskPatch', () => {
  const now = new Date('2026-02-01T00:00:00.000Z');
  const open = { doneAt: null };
  const done = { doneAt: new Date('2026-01-31T00:00:00.000Z') };

  it('returns an empty update for an empty patch', () => {
    expect(buildTaskPatch(open, {}, now)).toEqual({ data: {}, completed: false });
  });

  it('validates and trims the title', () => {
    expect(buildTaskPatch(open, { title: ' New ' }, now).data).toEqual({ title: 'New' });
    expect(() => buildTaskPatch(open, { title: '  ' }, now)).toThrow(BadRequestException);
  });

  it('sets and clears the due date', () => {
    expect(buildTaskPatch(open, { dueAt: '2026-03-01T00:00:00.000Z' }, now).data.dueAt).toEqual(
      new Date('2026-03-01T00:00:00.000Z'),
    );
    expect(buildTaskPatch(open, { dueAt: null }, now).data).toEqual({ dueAt: null });
  });

  it('completes an open task once, flagging the activity', () => {
    expect(buildTaskPatch(open, { done: true }, now)).toEqual({
      data: { doneAt: now },
      completed: true,
    });
    expect(buildTaskPatch(done, { done: true }, now)).toEqual({ data: {}, completed: false });
  });

  it('reopens a done task without a completion activity', () => {
    expect(buildTaskPatch(done, { done: false }, now)).toEqual({
      data: { doneAt: null },
      completed: false,
    });
    expect(buildTaskPatch(open, { done: false }, now)).toEqual({ data: {}, completed: false });
  });
});

describe('orderings and cursors', () => {
  it('orders my tasks by due date nulls last, then created, then id', () => {
    expect(MY_TASKS_ORDER_BY).toEqual([
      { dueAt: { sort: 'asc', nulls: 'last' } },
      { createdAt: 'asc' },
      { id: 'asc' },
    ]);
  });

  it('builds the first page filter without a cursor', () => {
    expect(buildActivityPageWhere('l1')).toEqual({ leadId: 'l1' });
  });

  it('builds a strictly-after keyset condition from a cursor', () => {
    const row = { id: 'a5', createdAt: new Date('2026-02-01T10:00:00.000Z') };
    const where = buildActivityPageWhere('l1', activityCursorFor(row));
    expect(where).toEqual({
      leadId: 'l1',
      OR: [{ createdAt: { lt: row.createdAt } }, { createdAt: row.createdAt, id: { lt: 'a5' } }],
    });
  });

  it('rejects cursors of another listing with a 400', () => {
    const foreign = Buffer.from(JSON.stringify(['score', 10, 'x'])).toString('base64url');
    expect(() => buildActivityPageWhere('l1', foreign)).toThrow(BadRequestException);
    expect(() => buildActivityPageWhere('l1', 'garbage')).toThrow(BadRequestException);
  });
});
