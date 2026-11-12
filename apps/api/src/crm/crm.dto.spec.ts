import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import {
  ActivityQueryDto,
  AssignLeadDto,
  CreateNoteDto,
  CreateTaskDto,
  UpdateTaskDto,
} from './crm.dto';

type Ctor<T extends object> = new () => T;

function errors<T extends object>(cls: Ctor<T>, plain: Record<string, unknown>): number {
  return validateSync(plainToInstance(cls, plain), {
    whitelist: true,
    forbidNonWhitelisted: true,
  }).length;
}

describe('CreateNoteDto', () => {
  it('accepts up to 2000 characters', () => {
    expect(errors(CreateNoteDto, { body: 'a'.repeat(2000) })).toBe(0);
  });
  it.each([
    ['missing', {}],
    ['not a string', { body: 5 }],
    ['2001 chars', { body: 'a'.repeat(2001) }],
    ['unknown field', { body: 'x', authorId: 'u1' }],
  ])('rejects %s', (_n, plain) => {
    expect(errors(CreateNoteDto, plain)).toBeGreaterThan(0);
  });
});

describe('CreateTaskDto', () => {
  it('accepts a title alone, a due date and an explicit null assignee', () => {
    expect(errors(CreateTaskDto, { title: 'Call' })).toBe(0);
    expect(errors(CreateTaskDto, { title: 'Call', dueAt: '2026-03-01T00:00:00.000Z' })).toBe(0);
    expect(errors(CreateTaskDto, { title: 'Call', assigneeId: null })).toBe(0);
    expect(errors(CreateTaskDto, { title: 'Call', assigneeId: 'u2' })).toBe(0);
  });
  it.each([
    ['no title', {}],
    ['title too long', { title: 'a'.repeat(201) }],
    ['bad date', { title: 'x', dueAt: 'tomorrow' }],
    ['empty assignee', { title: 'x', assigneeId: '' }],
    ['numeric assignee', { title: 'x', assigneeId: 3 }],
    ['unknown field', { title: 'x', doneAt: '2026-03-01T00:00:00.000Z' }],
  ])('rejects %s', (_n, plain) => {
    expect(errors(CreateTaskDto, plain)).toBeGreaterThan(0);
  });
});

describe('UpdateTaskDto', () => {
  it('accepts any subset, including a null due date to clear it', () => {
    expect(errors(UpdateTaskDto, {})).toBe(0);
    expect(errors(UpdateTaskDto, { title: 'New', done: true })).toBe(0);
    expect(errors(UpdateTaskDto, { dueAt: null })).toBe(0);
    expect(errors(UpdateTaskDto, { dueAt: '2026-03-01' })).toBe(0);
  });
  it.each([
    ['done as string', { done: 'yes' }],
    ['bad date', { dueAt: 'soon' }],
    ['long title', { title: 'a'.repeat(201) }],
    ['unknown field', { assigneeId: 'u1' }],
  ])('rejects %s', (_n, plain) => {
    expect(errors(UpdateTaskDto, plain)).toBeGreaterThan(0);
  });
});

describe('AssignLeadDto', () => {
  it('accepts a user id or null', () => {
    expect(errors(AssignLeadDto, { assigneeId: 'u1' })).toBe(0);
    expect(errors(AssignLeadDto, { assigneeId: null })).toBe(0);
  });
  it.each([
    ['missing', {}],
    ['empty', { assigneeId: '' }],
    ['number', { assigneeId: 4 }],
  ])('rejects %s', (_n, plain) => {
    expect(errors(AssignLeadDto, plain)).toBeGreaterThan(0);
  });
});

describe('ActivityQueryDto', () => {
  it('defaults the limit to 50 and rejects out-of-range values', () => {
    const dto = plainToInstance(ActivityQueryDto, {});
    expect(dto.limit).toBe(50);
    expect(errors(ActivityQueryDto, { limit: '0' })).toBeGreaterThan(0);
    expect(errors(ActivityQueryDto, { limit: '201' })).toBeGreaterThan(0);
    expect(errors(ActivityQueryDto, { limit: '20', cursor: 'abc' })).toBe(0);
  });
});
