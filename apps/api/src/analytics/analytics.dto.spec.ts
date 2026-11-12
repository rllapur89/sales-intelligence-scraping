import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { describe, expect, it } from 'vitest';
import { ScoreTrendQueryDto } from './analytics.dto';

function parse(query: Record<string, unknown>) {
  const dto = plainToInstance(ScoreTrendQueryDto, query);
  return { dto, errors: validateSync(dto, { whitelist: true, forbidNonWhitelisted: true }) };
}

describe('ScoreTrendQueryDto', () => {
  it('defaults to 30 days', () => {
    const { dto, errors } = parse({});
    expect(errors).toHaveLength(0);
    expect(dto.days).toBe(30);
  });

  it('coerces the query string and accepts the bounds 1 and 90', () => {
    expect(parse({ days: '7' }).dto.days).toBe(7);
    expect(parse({ days: '1' }).errors).toHaveLength(0);
    expect(parse({ days: '90' }).errors).toHaveLength(0);
  });

  it.each(['0', '91', '-3', '2.5', 'abc'])('rejects days=%s', (days) => {
    expect(parse({ days }).errors).toHaveLength(1);
  });

  it('rejects unknown parameters', () => {
    expect(parse({ days: '7', bogus: '1' }).errors).toHaveLength(1);
  });
});
