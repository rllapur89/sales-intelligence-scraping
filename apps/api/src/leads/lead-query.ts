import type { Prisma } from '@leads/db';
import type { PipelineStage, SignalType } from '@leads/shared';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { toDbSignalType, toDbStage } from '../common/mappers';

export type LeadSort = 'score' | 'updated';

export interface LeadFilters {
  industry?: string[];
  region?: string[];
  signalType?: SignalType[];
  minScore?: number;
  stage?: PipelineStage;
  q?: string;
}

/** Filters to a Prisma where. Empty/absent filters add no condition. */
export function buildLeadWhere(filters: LeadFilters): Prisma.LeadWhereInput {
  const where: Prisma.LeadWhereInput = {};
  if (filters.industry?.length) where.industry = { in: filters.industry };
  if (filters.region?.length) where.region = { in: filters.region };
  if (filters.signalType?.length) {
    where.signalTypes = { hasSome: filters.signalType.map(toDbSignalType) };
  }
  if (filters.minScore !== undefined) where.score = { gte: filters.minScore };
  if (filters.stage) where.stage = toDbStage(filters.stage);
  const q = filters.q?.trim();
  if (q) where.company = { name: { contains: q, mode: 'insensitive' } };
  return where;
}

export function buildLeadOrderBy(sort: LeadSort): Prisma.LeadOrderByWithRelationInput[] {
  return sort === 'updated'
    ? [{ updatedAt: 'desc' }, { id: 'desc' }]
    : [{ score: 'desc' }, { id: 'desc' }];
}

/** Keyset condition for rows strictly after the cursor in the given sort. */
export function buildLeadCursorWhere(sort: LeadSort, cursor: string): Prisma.LeadWhereInput {
  const pos = decodeCursor(cursor, sort);
  if (sort === 'updated') {
    const at = new Date(pos.value as string);
    return { OR: [{ updatedAt: { lt: at } }, { updatedAt: at, id: { lt: pos.id } }] };
  }
  const score = pos.value as number;
  return { OR: [{ score: { lt: score } }, { score, id: { lt: pos.id } }] };
}

/** Combines filters and the keyset condition without overwriting either. */
export function buildLeadListWhere(
  filters: LeadFilters,
  sort: LeadSort,
  cursor?: string,
): Prisma.LeadWhereInput {
  const base = buildLeadWhere(filters);
  return cursor ? { AND: [base, buildLeadCursorWhere(sort, cursor)] } : base;
}

export function leadCursorFor(
  sort: LeadSort,
  row: { id: string; score: number; updatedAt: Date },
): string {
  return encodeCursor(sort, {
    value: sort === 'updated' ? row.updatedAt.toISOString() : row.score,
    id: row.id,
  });
}

/** Fetching limit+1 rows tells whether another page exists. Returns the page rows and cursor. */
export function sliceKeysetPage<T>(
  rows: T[],
  limit: number,
  cursorOf: (row: T) => string,
): { items: T[]; nextCursor: string | null } {
  if (rows.length <= limit) return { items: rows, nextCursor: null };
  const items = rows.slice(0, limit);
  return { items, nextCursor: cursorOf(items[items.length - 1] as T) };
}
