import { describe, expect, it } from 'vitest';
import {
  ACTIVITY_TYPES,
  fromDbActivityType,
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
