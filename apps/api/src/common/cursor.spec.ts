import { BadRequestException } from '@nestjs/common';
import { describe, expect, it } from 'vitest';
import { decodeCursor, encodeCursor } from './cursor';

const b64 = (v: unknown): string => Buffer.from(JSON.stringify(v)).toString('base64url');

describe('cursor', () => {
  it('round-trips a score cursor', () => {
    const c = encodeCursor('score', { value: 87, id: 'abc' });
    expect(c).toMatch(/^[A-Za-z0-9_-]+$/);
    expect(decodeCursor(c, 'score')).toEqual({ value: 87, id: 'abc' });
  });

  it('round-trips a date cursor', () => {
    const iso = '2025-01-02T03:04:05.000Z';
    expect(decodeCursor(encodeCursor('updated', { value: iso, id: 'x' }), 'updated')).toEqual({
      value: iso,
      id: 'x',
    });
  });

  it.each([
    ['not base64 json', 'zzz!!'],
    ['not an array', b64({ a: 1 })],
    ['wrong length', b64(['score', 1])],
    ['empty id', b64(['score', 1, ''])],
    ['non-integer score', b64(['score', 1.5, 'a'])],
    ['string score', b64(['score', '1', 'a'])],
    ['bad date', b64(['updated', 'nope', 'a'])],
    ['kind mismatch', b64(['updated', '2025-01-02T03:04:05.000Z', 'a'])],
  ])('rejects %s with 400', (_name, cursor) => {
    expect(() => decodeCursor(cursor, 'score')).toThrow(BadRequestException);
  });
});
