import { BadRequestException, ForbiddenException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { NotesService } from './notes.service';

const author = { id: 'u1', email: 'a@x.io', role: 'user' as const };
const admin = { id: 'u9', email: 'b@x.io', role: 'admin' as const };
const at = new Date('2026-02-01T10:00:00.000Z');
const noteRow = { id: 'n1', leadId: 'l1', authorId: 'u1', body: 'hello', createdAt: at };

describe('NotesService', () => {
  const db = {
    lead: { findUnique: vi.fn() },
    leadNote: { findMany: vi.fn(), findFirst: vi.fn(), create: vi.fn(), delete: vi.fn() },
    leadActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: NotesService;

  beforeEach(() => {
    db.lead.findUnique.mockReset().mockResolvedValue({ id: 'l1' });
    for (const fn of Object.values(db.leadNote)) fn.mockReset();
    db.leadActivity.create.mockReset();
    db.$transaction.mockReset().mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    service = new NotesService(db as unknown as PrismaService);
  });

  describe('list', () => {
    it('returns the lead notes newest first as DTOs', async () => {
      db.leadNote.findMany.mockResolvedValue([noteRow]);
      expect(await service.list('l1')).toEqual([
        {
          id: 'n1',
          leadId: 'l1',
          authorId: 'u1',
          body: 'hello',
          createdAt: '2026-02-01T10:00:00.000Z',
        },
      ]);
      expect(db.leadNote.findMany).toHaveBeenCalledWith({
        where: { leadId: 'l1' },
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        take: 200,
      });
    });

    it('404s for an unknown lead without querying notes', async () => {
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.list('nope')).rejects.toThrow(NotFoundException);
      expect(db.leadNote.findMany).not.toHaveBeenCalled();
    });
  });

  describe('create', () => {
    it('stores the trimmed note and a note_added activity without the text, in one transaction', async () => {
      db.leadNote.create.mockResolvedValue(noteRow);
      const dto = await service.create('l1', author, '  hello  ');
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.leadNote.create).toHaveBeenCalledWith({
        data: { leadId: 'l1', authorId: 'u1', body: 'hello' },
      });
      expect(db.leadActivity.create).toHaveBeenCalledWith({
        data: { leadId: 'l1', actorId: 'u1', type: 'NOTE_ADDED', data: { noteId: 'n1' } },
      });
      expect(dto.id).toBe('n1');
    });

    it.each([['   '], ['a'.repeat(2001)]])(
      'rejects invalid body and writes nothing',
      async (body) => {
        await expect(service.create('l1', author, body)).rejects.toThrow(BadRequestException);
        expect(db.$transaction).not.toHaveBeenCalled();
        expect(db.leadNote.create).not.toHaveBeenCalled();
        expect(db.leadActivity.create).not.toHaveBeenCalled();
      },
    );

    it('404s for an unknown lead and writes nothing', async () => {
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.create('nope', author, 'hi')).rejects.toThrow(NotFoundException);
      expect(db.$transaction).not.toHaveBeenCalled();
    });
  });

  describe('remove', () => {
    it('lets the author delete', async () => {
      db.leadNote.findFirst.mockResolvedValue(noteRow);
      await service.remove('l1', 'n1', author);
      expect(db.leadNote.findFirst).toHaveBeenCalledWith({ where: { id: 'n1', leadId: 'l1' } });
      expect(db.leadNote.delete).toHaveBeenCalledWith({ where: { id: 'n1' } });
    });

    it('lets an admin delete a note of someone else', async () => {
      db.leadNote.findFirst.mockResolvedValue(noteRow);
      await service.remove('l1', 'n1', admin);
      expect(db.leadNote.delete).toHaveBeenCalledTimes(1);
    });

    it('403s for another user and keeps the note', async () => {
      db.leadNote.findFirst.mockResolvedValue(noteRow);
      await expect(
        service.remove('l1', 'n1', { id: 'u2', email: 'c@x.io', role: 'user' }),
      ).rejects.toThrow(ForbiddenException);
      expect(db.leadNote.delete).not.toHaveBeenCalled();
    });

    it('404s for an unknown note or a note of another lead', async () => {
      db.leadNote.findFirst.mockResolvedValue(null);
      await expect(service.remove('l1', 'zzz', admin)).rejects.toThrow(NotFoundException);
      expect(db.leadNote.delete).not.toHaveBeenCalled();
    });
  });
});
