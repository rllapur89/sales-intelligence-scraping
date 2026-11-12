import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { TasksService } from './tasks.service';

const user = { id: 'u1', email: 'a@x.io', role: 'user' as const };
const at = new Date('2026-02-01T10:00:00.000Z');
const taskRow = {
  id: 't1',
  leadId: 'l1',
  createdById: 'u1',
  assigneeId: 'u1',
  title: 'Call',
  dueAt: null,
  doneAt: null,
  createdAt: at,
};

describe('TasksService', () => {
  const db = {
    lead: { findUnique: vi.fn() },
    user: { findUnique: vi.fn() },
    leadTask: { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() },
    leadActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: TasksService;

  beforeEach(() => {
    db.lead.findUnique.mockReset().mockResolvedValue({ id: 'l1' });
    db.user.findUnique.mockReset().mockResolvedValue({ id: 'u2' });
    for (const fn of Object.values(db.leadTask)) fn.mockReset();
    db.leadActivity.create.mockReset();
    db.$transaction.mockReset().mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    service = new TasksService(db as unknown as PrismaService);
  });

  describe('listForLead', () => {
    it('lists tasks of the lead as DTOs', async () => {
      db.leadTask.findMany.mockResolvedValue([taskRow]);
      const out = await service.listForLead('l1');
      expect(out).toHaveLength(1);
      expect(out[0]).toMatchObject({ id: 't1', dueAt: null, doneAt: null });
      expect(db.leadTask.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { leadId: 'l1' } });
    });

    it('404s for an unknown lead', async () => {
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.listForLead('nope')).rejects.toThrow(NotFoundException);
    });
  });

  describe('create', () => {
    it('assigns to the creator by default and records task_created', async () => {
      db.leadTask.create.mockResolvedValue(taskRow);
      await service.create('l1', user, { title: '  Call  ', dueAt: '2026-03-01T00:00:00.000Z' });
      expect(db.leadTask.create).toHaveBeenCalledWith({
        data: {
          leadId: 'l1',
          createdById: 'u1',
          assigneeId: 'u1',
          title: 'Call',
          dueAt: new Date('2026-03-01T00:00:00.000Z'),
        },
      });
      expect(db.leadActivity.create).toHaveBeenCalledWith({
        data: {
          leadId: 'l1',
          actorId: 'u1',
          type: 'TASK_CREATED',
          data: { taskId: 't1', assigneeId: 'u1' },
        },
      });
      expect(db.user.findUnique).not.toHaveBeenCalled();
    });

    it('supports an explicit null assignee and no due date', async () => {
      db.leadTask.create.mockResolvedValue({ ...taskRow, assigneeId: null });
      await service.create('l1', user, { title: 'Call', assigneeId: null });
      expect(db.leadTask.create.mock.calls[0]?.[0].data).toMatchObject({
        assigneeId: null,
        dueAt: null,
      });
    });

    it('checks that another assignee exists', async () => {
      db.leadTask.create.mockResolvedValue({ ...taskRow, assigneeId: 'u2' });
      await service.create('l1', user, { title: 'Call', assigneeId: 'u2' });
      expect(db.user.findUnique).toHaveBeenCalledWith({
        where: { id: 'u2' },
        select: { id: true },
      });
    });

    it('rejects an unknown assignee and writes nothing', async () => {
      db.user.findUnique.mockResolvedValue(null);
      await expect(service.create('l1', user, { title: 'x', assigneeId: 'ghost' })).rejects.toThrow(
        BadRequestException,
      );
      expect(db.$transaction).not.toHaveBeenCalled();
    });

    it('rejects a blank title and an unknown lead', async () => {
      await expect(service.create('l1', user, { title: '  ' })).rejects.toThrow(
        BadRequestException,
      );
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.create('nope', user, { title: 'x' })).rejects.toThrow(NotFoundException);
      expect(db.leadTask.create).not.toHaveBeenCalled();
    });
  });

  describe('update', () => {
    it('completes an open task and records task_completed with the task lead', async () => {
      db.leadTask.findUnique.mockResolvedValue(taskRow);
      db.leadTask.update.mockResolvedValue({ ...taskRow, doneAt: at });
      const dto = await service.update('t1', user, { done: true });
      const call = db.leadTask.update.mock.calls[0]?.[0];
      expect(call.where).toEqual({ id: 't1' });
      expect(call.data.doneAt).toBeInstanceOf(Date);
      expect(db.leadActivity.create).toHaveBeenCalledWith({
        data: { leadId: 'l1', actorId: 'u1', type: 'TASK_COMPLETED', data: { taskId: 't1' } },
      });
      expect(dto.doneAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('edits title and due date without an activity', async () => {
      db.leadTask.findUnique.mockResolvedValue(taskRow);
      db.leadTask.update.mockResolvedValue({ ...taskRow, title: 'New' });
      await service.update('t1', user, { title: ' New ', dueAt: null });
      expect(db.leadTask.update.mock.calls[0]?.[0].data).toEqual({ title: 'New', dueAt: null });
      expect(db.leadActivity.create).not.toHaveBeenCalled();
    });

    it('completing an already done task is a no-op (no write, no activity)', async () => {
      db.leadTask.findUnique.mockResolvedValue({ ...taskRow, doneAt: at });
      const dto = await service.update('t1', user, { done: true });
      expect(db.$transaction).not.toHaveBeenCalled();
      expect(db.leadActivity.create).not.toHaveBeenCalled();
      expect(dto.doneAt).toBe('2026-02-01T10:00:00.000Z');
    });

    it('reopens a done task', async () => {
      db.leadTask.findUnique.mockResolvedValue({ ...taskRow, doneAt: at });
      db.leadTask.update.mockResolvedValue(taskRow);
      await service.update('t1', user, { done: false });
      expect(db.leadTask.update.mock.calls[0]?.[0].data).toEqual({ doneAt: null });
      expect(db.leadActivity.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown task and 400s for a blank title', async () => {
      db.leadTask.findUnique.mockResolvedValue(null);
      await expect(service.update('zzz', user, { done: true })).rejects.toThrow(NotFoundException);
      db.leadTask.findUnique.mockResolvedValue(taskRow);
      await expect(service.update('t1', user, { title: ' ' })).rejects.toThrow(BadRequestException);
      expect(db.leadTask.update).not.toHaveBeenCalled();
    });
  });

  describe('mine', () => {
    it('queries open tasks of the user, due first, and adds the company name', async () => {
      db.leadTask.findMany.mockResolvedValue([{ ...taskRow, lead: { company: { name: 'Acme' } } }]);
      const out = await service.mine('u1');
      const arg = db.leadTask.findMany.mock.calls[0]?.[0];
      expect(arg.where).toEqual({ assigneeId: 'u1', doneAt: null });
      expect(arg.orderBy[0]).toEqual({ dueAt: { sort: 'asc', nulls: 'last' } });
      expect(out[0]).toMatchObject({ id: 't1', companyName: 'Acme' });
      expect('lead' in (out[0] as object)).toBe(false);
    });
  });
});
