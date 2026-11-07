import { BadRequestException } from '@nestjs/common';

/** Which ordering a cursor belongs to; a cursor from one listing is rejected by another. */
export type CursorKind = 'score' | 'updated' | 'created';

export interface CursorPosition {
  /** Sort value of the last returned row: a number for `score`, an ISO date for the others. */
  value: number | string;
  /** Id of the last returned row (tie-breaker). */
  id: string;
}

export const INVALID_CURSOR_MESSAGE = 'Invalid cursor';

/** Opaque base64url cursor: `[kind, value, id]` as JSON. */
export function encodeCursor(kind: CursorKind, position: CursorPosition): string {
  return Buffer.from(JSON.stringify([kind, position.value, position.id]), 'utf8').toString(
    'base64url',
  );
}

/** Decodes and validates a cursor. Any malformed or mismatching input becomes a 400. */
export function decodeCursor(cursor: string, kind: CursorKind): CursorPosition {
  let parsed: unknown;
  try {
    parsed = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  if (!Array.isArray(parsed) || parsed.length !== 3) {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  const [k, value, id] = parsed as unknown[];
  if (k !== kind || typeof id !== 'string' || id === '') {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  if (kind === 'score') {
    if (typeof value !== 'number' || !Number.isInteger(value)) {
      throw new BadRequestException(INVALID_CURSOR_MESSAGE);
    }
  } else if (typeof value !== 'string' || Number.isNaN(Date.parse(value))) {
    throw new BadRequestException(INVALID_CURSOR_MESSAGE);
  }
  return { value: value as number | string, id };
}
