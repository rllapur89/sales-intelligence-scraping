import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPES,
  compareMyTasks,
  fromDbActivityType,
  isTaskOverdue,
  toActivityDto,
  toDbActivityType,
  toMyTaskDto,
  toNoteDto,
  toTaskDto,
  type DbTaskRow,
} from './crm';

const at = new Date('2026-02-01T10:00:00.000Z');

const task: DbTaskRow = {
  id: 't1',
  leadId: 'l1',
  createdById: 'u1',
  assigneeId: 'u2',
  title: 'Call back',
  dueAt: new Date('2026-02-03T00:00:00.000Z'),
  doneAt: null,
  createdAt: at,
};

describe('activity types', () => {
  it('keeps underscores and round-trips every type', () => {
    expect(fromDbActivityType('STAGE_CHANGED')).toBe('stage_changed');
    for (const type of ACTIVITY_TYPES) {
      expect(fromDbActivityType(toDbActivityType(type))).toBe(type);
    }
    expect(toDbActivityType('task_completed')).toBe('TASK_COMPLETED');
  });
});

describe('toNoteDto', () => {
  it('serializes the date and exposes only the contract fields', () => {
    expect(
      toNoteDto({ id: 'n1', leadId: 'l1', authorId: 'u1', body: 'hello', createdAt: at }),
    ).toEqual({
      id: 'n1',
      leadId: 'l1',
      authorId: 'u1',
      body: 'hello',
      createdAt: '2026-02-01T10:00:00.000Z',
    });
  });
});

describe('toTaskDto', () => {
  it('maps dates to ISO strings and keeps nulls', () => {
    expect(toTaskDto(task)).toEqual({
      id: 't1',
      leadId: 'l1',
      createdById: 'u1',
      assigneeId: 'u2',
      title: 'Call back',
      dueAt: '2026-02-03T00:00:00.000Z',
      doneAt: null,
      createdAt: '2026-02-01T10:00:00.000Z',
    });
    const done = toTaskDto({ ...task, dueAt: null, assigneeId: null, doneAt: at });
    expect(done.dueAt).toBeNull();
    expect(done.assigneeId).toBeNull();
    expect(done.doneAt).toBe('2026-02-01T10:00:00.000Z');
  });
});

describe('toMyTaskDto', () => {
  it('adds the company name and drops the nested lead', () => {
    const dto = toMyTaskDto({ ...task, lead: { company: { name: 'Acme' } } });
    expect(dto).toEqual({ ...toTaskDto(task), companyName: 'Acme' });
    expect('lead' in dto).toBe(false);
  });
});

describe('toActivityDto', () => {
  it('maps type and data', () => {
    expect(
      toActivityDto({
        id: 'a1',
        leadId: 'l1',
        actorId: null,
        type: 'STAGE_CHANGED',
        data: { from: 'new', to: 'won' },
        createdAt: at,
      }),
    ).toEqual({
      id: 'a1',
      leadId: 'l1',
      actorId: null,
      type: 'stage_changed',
      data: { from: 'new', to: 'won' },
      createdAt: '2026-02-01T10:00:00.000Z',
    });
  });

  it.each([[null], ['text'], [[1, 2]], [undefined]])('falls back to {} for data %j', (data) => {
    const dto = toActivityDto({
      id: 'a1',
      leadId: 'l1',
      actorId: 'u1',
      type: 'NOTE_ADDED',
      data,
      createdAt: at,
    });
    expect(dto.data).toEqual({});
  });
});

describe('isTaskOverdue', () => {
  const now = new Date('2026-02-02T00:00:00.000Z');
  it('is overdue only for open tasks with a past due date', () => {
    expect(isTaskOverdue({ dueAt: '2026-02-01T00:00:00.000Z', doneAt: null }, now)).toBe(true);
    expect(isTaskOverdue({ dueAt: '2026-02-03T00:00:00.000Z', doneAt: null }, now)).toBe(false);
    expect(isTaskOverdue({ dueAt: null, doneAt: null }, now)).toBe(false);
    expect(
      isTaskOverdue({ dueAt: '2026-02-01T00:00:00.000Z', doneAt: '2026-02-01T05:00:00.000Z' }, now),
    ).toBe(false);
  });
});

describe('compareMyTasks', () => {
  const t = (id: string, dueAt: string | null, createdAt = '2026-02-01T00:00:00.000Z') => ({
    id,
    dueAt,
    createdAt,
  });
  it('orders by due date, nulls last, then created, then id', () => {
    const sorted = [
      t('e', null, '2026-01-01T00:00:00.000Z'),
      t('d', '2026-03-01T00:00:00.000Z'),
      t('c', '2026-02-01T00:00:00.000Z', '2026-01-02T00:00:00.000Z'),
      t('b', '2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
      t('a', '2026-02-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z'),
      t('f', null, '2026-01-05T00:00:00.000Z'),
    ].sort(compareMyTasks);
    expect(sorted.map((x) => x.id)).toEqual(['a', 'b', 'c', 'd', 'e', 'f']);
  });
  it('returns 0 for the same task', () => {
    expect(compareMyTasks(t('a', null), t('a', null))).toBe(0);
  });
});
