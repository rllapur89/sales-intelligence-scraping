import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { MarkReadDto, NotificationsQueryDto } from './notifications.dto';

type Ctor<T extends object> = new () => T;

function parse<T extends object>(cls: Ctor<T>, plain: Record<string, unknown>) {
  const dto = plainToInstance(cls, plain);
  const errors = validateSync(dto, { whitelist: true, forbidNonWhitelisted: true });
  return { dto, errors: errors.length };
}

describe('NotificationsQueryDto', () => {
  it('defaults to 50 rows and no unread filter', () => {
    const { dto, errors } = parse(NotificationsQueryDto, {});
    expect(errors).toBe(0);
    expect(dto.limit).toBe(50);
    expect(dto.unreadOnly).toBeUndefined();
  });

  it.each([
    ['true', true],
    ['false', false],
  ])('reads unreadOnly=%s from the query string', (raw, expected) => {
    const { dto, errors } = parse(NotificationsQueryDto, { unreadOnly: raw });
    expect(errors).toBe(0);
    expect(dto.unreadOnly).toBe(expected);
  });

  it.each([['yes'], ['1'], ['']])('rejects unreadOnly=%j', (raw) => {
    expect(parse(NotificationsQueryDto, { unreadOnly: raw }).errors).toBeGreaterThan(0);
  });

  it('rejects a limit above 200', () => {
    expect(parse(NotificationsQueryDto, { limit: '201' }).errors).toBeGreaterThan(0);
  });
});

describe('MarkReadDto', () => {
  it('accepts ids, all, or both', () => {
    expect(parse(MarkReadDto, { ids: ['a'] }).errors).toBe(0);
    expect(parse(MarkReadDto, { all: true }).errors).toBe(0);
    expect(parse(MarkReadDto, { ids: ['a'], all: false }).errors).toBe(0);
  });

  it('accepts exactly 200 ids and rejects 201', () => {
    const ids = (n: number) => Array.from({ length: n }, (_, i) => `n${i}`);
    expect(parse(MarkReadDto, { ids: ids(200) }).errors).toBe(0);
    expect(parse(MarkReadDto, { ids: ids(201) }).errors).toBeGreaterThan(0);
  });

  it.each([
    ['ids not an array', { ids: 'a' }],
    ['non-string id', { ids: [1] }],
    ['empty id', { ids: [''] }],
    ['all not boolean', { all: 'true' }],
    ['unknown field', { ids: ['a'], userId: 'other' }],
  ])('rejects %s', (_name, body) => {
    expect(parse(MarkReadDto, body).errors).toBeGreaterThan(0);
  });
});
