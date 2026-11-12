import { BadRequestException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import {
  NotificationsService,
  buildNotificationPageWhere,
  notificationCursorFor,
} from './notifications.service';

const now = new Date('2026-02-02T12:00:00.000Z');
const row = (n: number, readAt: Date | null = null) => ({
  id: `n${n}`,
  userId: 'u1',
  type: 'NEW_MATCH',
  leadId: `l${n}`,
  title: `Company ${n}`,
  createdAt: new Date(Date.UTC(2026, 1, 2, 10, 0, 10 - n)),
  readAt,
});
const c = (id: string) => ({ leadId: id, title: `Company ${id}` });

describe('NotificationsService', () => {
  const n = {
    findMany: vi.fn(),
    count: vi.fn(),
    updateMany: vi.fn(),
    createMany: vi.fn(),
  };
  let service: NotificationsService;

  beforeEach(() => {
    for (const fn of Object.values(n)) fn.mockReset();
    service = new NotificationsService({ notification: n } as unknown as PrismaService);
  });

  describe('list', () => {
    it('fetches limit+1 newest first for the caller and returns a cursor when more exist', async () => {
      n.findMany.mockResolvedValue([row(1), row(2), row(3)]);
      const page = await service.list('u1', { limit: 2 });
      expect(n.findMany).toHaveBeenCalledWith({
        where: { userId: 'u1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 3,
      });
      expect(page.items.map((i) => i.id)).toEqual(['n1', 'n2']);
      expect(page.items[0]).toMatchObject({ type: 'new_match', readAt: null });
      expect(page.nextCursor).toBe(notificationCursorFor(row(2)));
    });

    it('returns a null cursor on the last page', async () => {
      n.findMany.mockResolvedValue([row(1)]);
      expect((await service.list('u1', { limit: 2 })).nextCursor).toBeNull();
    });

    it('filters unread rows only when asked', async () => {
      n.findMany.mockResolvedValue([]);
      await service.list('u1', { limit: 5, unreadOnly: true });
      expect(n.findMany.mock.calls[0]?.[0].where).toEqual({ userId: 'u1', readAt: null });
    });

    it('uses the cursor as a keyset condition and 400s on an invalid one', async () => {
      n.findMany.mockResolvedValue([]);
      await service.list('u1', { limit: 2, cursor: notificationCursorFor(row(2)) });
      const where = n.findMany.mock.calls[0]?.[0].where;
      expect(where.userId).toBe('u1');
      expect(where.OR).toHaveLength(2);
      await expect(service.list('u1', { limit: 2, cursor: 'bad' })).rejects.toThrow(
        BadRequestException,
      );
    });

    it('keeps the unread filter together with the cursor', () => {
      const where = buildNotificationPageWhere('u1', true, notificationCursorFor(row(2)));
      expect(where).toMatchObject({ userId: 'u1', readAt: null });
      expect(where.OR).toHaveLength(2);
    });
  });

  describe('unreadCount', () => {
    it('counts only the caller unread rows', async () => {
      n.count.mockResolvedValue(4);
      expect(await service.unreadCount('u1')).toEqual({ count: 4 });
      expect(n.count).toHaveBeenCalledWith({ where: { userId: 'u1', readAt: null } });
    });
  });

  describe('markRead', () => {
    it('marks the given ids, scoped to the caller and to unread rows', async () => {
      n.updateMany.mockResolvedValue({ count: 2 });
      expect(await service.markRead('u1', { ids: ['a', 'b', 'foreign'] }, now)).toEqual({
        updated: 2,
      });
      expect(n.updateMany).toHaveBeenCalledWith({
        where: { userId: 'u1', readAt: null, id: { in: ['a', 'b', 'foreign'] } },
        data: { readAt: now },
      });
    });

    it('marks every unread row of the caller for all: true, ignoring ids', async () => {
      n.updateMany.mockResolvedValue({ count: 7 });
      expect(await service.markRead('u1', { all: true, ids: ['x'] }, now)).toEqual({ updated: 7 });
      expect(n.updateMany.mock.calls[0]?.[0].where).toEqual({ userId: 'u1', readAt: null });
    });

    it('never matches anything without ids and without all', async () => {
      n.updateMany.mockResolvedValue({ count: 0 });
      await service.markRead('u1', {}, now);
      expect(n.updateMany.mock.calls[0]?.[0].where).toEqual({
        userId: 'u1',
        readAt: null,
        id: { in: [] },
      });
    });
  });

  describe('recordMatches', () => {
    it('creates one new_match per lead that was not notified in the last 24 h', async () => {
      n.findMany.mockResolvedValue([
        { leadId: 'recent', createdAt: new Date(now.getTime() - 3_600_000) },
      ]);
      n.createMany.mockResolvedValue({ count: 2 });
      const created = await service.recordMatches('u1', [c('a'), c('recent'), c('b'), c('a')], now);
      expect(created).toBe(2);
      const lookup = n.findMany.mock.calls[0]?.[0];
      expect(lookup.where).toMatchObject({
        userId: 'u1',
        type: 'NEW_MATCH',
        leadId: { in: ['a', 'recent', 'b', 'a'] },
      });
      expect(lookup.where.createdAt.gt.toISOString()).toBe('2026-02-01T12:00:00.000Z');
      expect(n.createMany).toHaveBeenCalledWith({
        data: [
          { userId: 'u1', type: 'NEW_MATCH', leadId: 'a', title: 'Company a', createdAt: now },
          { userId: 'u1', type: 'NEW_MATCH', leadId: 'b', title: 'Company b', createdAt: now },
        ],
      });
    });

    it('writes nothing when every lead was notified recently', async () => {
      n.findMany.mockResolvedValue([{ leadId: 'a', createdAt: now }]);
      expect(await service.recordMatches('u1', [c('a')], now)).toBe(0);
      expect(n.createMany).not.toHaveBeenCalled();
    });

    it('does not even query without candidates', async () => {
      expect(await service.recordMatches('u1', [], now)).toBe(0);
      expect(n.findMany).not.toHaveBeenCalled();
    });
  });

  describe('recordRetractions', () => {
    it('creates retracted rows only for leads whose latest notification is a new_match', async () => {
      n.findMany.mockResolvedValue([
        { leadId: 'notified', type: 'NEW_MATCH' },
        { leadId: 'already', type: 'RETRACTED' },
      ]);
      n.createMany.mockResolvedValue({ count: 1 });
      const created = await service.recordRetractions(
        'u1',
        [c('notified'), c('already'), c('never')],
        now,
      );
      expect(created).toBe(1);
      expect(n.findMany.mock.calls[0]?.[0]).toMatchObject({
        where: { userId: 'u1', leadId: { in: ['notified', 'already', 'never'] } },
        orderBy: { createdAt: 'desc' },
        distinct: ['leadId'],
      });
      expect(n.createMany).toHaveBeenCalledWith({
        data: [
          {
            userId: 'u1',
            type: 'RETRACTED',
            leadId: 'notified',
            title: 'Company notified',
            createdAt: now,
          },
        ],
      });
    });

    it('writes nothing for leads the user was never notified about', async () => {
      n.findMany.mockResolvedValue([]);
      expect(await service.recordRetractions('u1', [c('a')], now)).toBe(0);
      expect(n.createMany).not.toHaveBeenCalled();
    });
  });

  describe('handleWindow', () => {
    it('returns immediately and swallows (and logs) database errors', async () => {
      n.findMany.mockRejectedValue(new Error('db down'));
      const warn = vi.spyOn(service['logger'], 'warn').mockImplementation(() => undefined);
      expect(() =>
        service.handleWindow('u1', { matches: [c('a')], retractions: [] }, now),
      ).not.toThrow();
      await vi.waitFor(() => expect(warn).toHaveBeenCalledTimes(1));
      expect(String(warn.mock.calls[0]?.[0])).toContain('db down');
    });

    it('does nothing for an empty window', () => {
      service.handleWindow('u1', { matches: [], retractions: [] }, now);
      expect(n.findMany).not.toHaveBeenCalled();
    });

    it('records matches and retractions of one window', async () => {
      n.findMany
        .mockResolvedValueOnce([])
        .mockResolvedValueOnce([{ leadId: 'r', type: 'NEW_MATCH' }]);
      n.createMany.mockResolvedValue({ count: 1 });
      expect(await service.record('u1', { matches: [c('a')], retractions: [c('r')] }, now)).toBe(2);
      expect(n.createMany).toHaveBeenCalledTimes(2);
    });
  });
});
