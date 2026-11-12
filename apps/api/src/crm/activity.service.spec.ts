import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { ActivityService } from './activity.service';
import { activityCursorFor } from './crm-rules';

const row = (n: number) => ({
  id: `a${n}`,
  leadId: 'l1',
  actorId: 'u1',
  type: 'NOTE_ADDED',
  data: { noteId: `n${n}` },
  createdAt: new Date(Date.UTC(2026, 1, 1, 10, 0, 10 - n)),
});

describe('ActivityService', () => {
  const db = { lead: { findUnique: vi.fn() }, leadActivity: { findMany: vi.fn() } };
  let service: ActivityService;

  beforeEach(() => {
    db.lead.findUnique.mockReset().mockResolvedValue({ id: 'l1' });
    db.leadActivity.findMany.mockReset();
    service = new ActivityService(db as unknown as PrismaService);
  });

  it('fetches limit+1 newest first and returns a cursor when more rows exist', async () => {
    db.leadActivity.findMany.mockResolvedValue([row(1), row(2), row(3)]);
    const page = await service.list('l1', { limit: 2 });
    expect(db.leadActivity.findMany).toHaveBeenCalledWith({
      where: { leadId: 'l1' },
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: 3,
    });
    expect(page.items.map((i) => i.id)).toEqual(['a1', 'a2']);
    expect(page.items[0]).toMatchObject({ type: 'note_added', data: { noteId: 'n1' } });
    expect(page.nextCursor).toBe(activityCursorFor(row(2)));
  });

  it('returns a null cursor on the last page', async () => {
    db.leadActivity.findMany.mockResolvedValue([row(1)]);
    expect((await service.list('l1', { limit: 2 })).nextCursor).toBeNull();
  });

  it('uses the cursor as a keyset condition for the next page', async () => {
    db.leadActivity.findMany.mockResolvedValue([]);
    await service.list('l1', { limit: 2, cursor: activityCursorFor(row(2)) });
    const where = db.leadActivity.findMany.mock.calls[0]?.[0].where;
    expect(where.leadId).toBe('l1');
    expect(where.OR).toHaveLength(2);
  });

  it('400s on an invalid cursor and 404s on an unknown lead', async () => {
    await expect(service.list('l1', { limit: 2, cursor: 'bad' })).rejects.toThrow(
      BadRequestException,
    );
    db.lead.findUnique.mockResolvedValue(null);
    await expect(service.list('nope', { limit: 2 })).rejects.toThrow(NotFoundException);
    expect(db.leadActivity.findMany).not.toHaveBeenCalled();
  });
});
