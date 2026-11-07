import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ListLeadsQueryDto, UpdateStageDto } from './leads.dto';

const parse = (plain: Record<string, unknown>): { dto: ListLeadsQueryDto; errors: number } => {
  const dto = plainToInstance(ListLeadsQueryDto, plain);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }).length };
};

describe('ListLeadsQueryDto', () => {
  it('applies defaults', () => {
    const { dto, errors } = parse({});
    expect(errors).toBe(0);
    expect(dto.limit).toBe(50);
    expect(dto.sort).toBe('score');
  });

  it('coerces numbers and wraps single values into arrays', () => {
    const { dto, errors } = parse({
      limit: '200',
      minScore: '30',
      industry: 'SaaS',
      signalType: ['hiring', 'funding'],
    });
    expect(errors).toBe(0);
    expect(dto.limit).toBe(200);
    expect(dto.minScore).toBe(30);
    expect(dto.industry).toEqual(['SaaS']);
    expect(dto.signalType).toEqual(['hiring', 'funding']);
  });

  it.each([
    ['limit 0', { limit: '0' }],
    ['limit 201', { limit: '201' }],
    ['limit text', { limit: 'abc' }],
    ['bad sort', { sort: 'name' }],
    ['bad signal type', { signalType: 'bogus' }],
    ['bad stage', { stage: 'NEW' }],
    ['minScore 101', { minScore: '101' }],
    ['unknown field', { foo: 'bar' }],
  ])('rejects %s', (_n, plain) => {
    expect(parse(plain).errors).toBeGreaterThan(0);
  });
});

describe('UpdateStageDto', () => {
  const errors = (plain: Record<string, unknown>): number =>
    validateSync(plainToInstance(UpdateStageDto, plain)).length;

  it('accepts lowercase shared stages only', () => {
    expect(errors({ stage: 'won' })).toBe(0);
    expect(errors({ stage: 'WON' })).toBeGreaterThan(0);
    expect(errors({})).toBeGreaterThan(0);
  });
});
