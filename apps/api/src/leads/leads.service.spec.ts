import { NotFoundException } from '@nestjs/common';
import { Prisma } from '@leads/db';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { LeadsService } from './leads.service';

const company = {
  id: 'c1',
  domain: 'acme.com',
  name: 'Acme',
  industry: null,
  region: null,
  size: null,
  description: null,
  techHints: [],
};
const leadRow = (stage: string, assigneeId: string | null = null) => ({
  id: 'l1',
  companyId: 'c1',
  score: 50,
  stage,
  signalTypes: [],
  signalCount: 0,
  seq: 1n,
  assigneeId,
  updatedAt: new Date('2026-02-01T10:00:00.000Z'),
  company,
});

describe('LeadsService', () => {
  const db = {
    lead: { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() },
    leadActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: LeadsService;

  beforeEach(() => {
    for (const fn of Object.values(db.lead)) fn.mockReset();
    db.leadActivity.create.mockReset();
    db.$transaction.mockReset().mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    service = new LeadsService(db as unknown as PrismaService);
  });

  describe('updateStage', () => {
    it('updates the stage and records stage_changed in the same transaction', async () => {
      db.lead.findUnique.mockResolvedValue({ stage: 'NEW' });
      db.lead.update.mockResolvedValue(leadRow('WON'));
      const dto = await service.updateStage('l1', 'won', 'u1');
      expect(db.$transaction).toHaveBeenCalledTimes(1);
      expect(db.lead.update).toHaveBeenCalledWith({
        where: { id: 'l1' },
        data: { stage: 'WON' },
        include: { company: true },
      });
      expect(db.leadActivity.create).toHaveBeenCalledWith({
        data: {
          leadId: 'l1',
          actorId: 'u1',
          type: 'STAGE_CHANGED',
          data: { from: 'new', to: 'won' },
        },
      });
      expect(dto.stage).toBe('won');
    });

    it('records no activity when the stage does not change', async () => {
      db.lead.findUnique.mockResolvedValue({ stage: 'WON' });
      db.lead.update.mockResolvedValue(leadRow('WON'));
      await service.updateStage('l1', 'won', 'u1');
      expect(db.leadActivity.create).not.toHaveBeenCalled();
    });

    it('404s for an unknown lead without writing', async () => {
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.updateStage('nope', 'won', 'u1')).rejects.toThrow(NotFoundException);
      expect(db.lead.update).not.toHaveBeenCalled();
      expect(db.leadActivity.create).not.toHaveBeenCalled();
    });

    it('maps a P2025 race on update to 404', async () => {
      db.lead.findUnique.mockResolvedValue({ stage: 'NEW' });
      db.lead.update.mockRejectedValue(
        new Prisma.PrismaClientKnownRequestError('gone', { code: 'P2025', clientVersion: 'x' }),
      );
      await expect(service.updateStage('l1', 'won', 'u1')).rejects.toThrow(NotFoundException);
    });

    it('rethrows unexpected errors', async () => {
      db.lead.findUnique.mockResolvedValue({ stage: 'NEW' });
      db.lead.update.mockRejectedValue(new Error('boom'));
      await expect(service.updateStage('l1', 'won', 'u1')).rejects.toThrow('boom');
    });
  });

  describe('existing behaviour', () => {
    it('lists leads as DTOs including the optional assignee', async () => {
      db.lead.findMany.mockResolvedValue([leadRow('NEW', 'u2')]);
      const page = await service.list({ limit: 10, sort: 'score' });
      expect(page.nextCursor).toBeNull();
      expect(page.items[0]).toMatchObject({ id: 'l1', stage: 'new', assigneeId: 'u2' });
    });

    it('404s for an unknown lead detail', async () => {
      db.lead.findUnique.mockResolvedValue(null);
      await expect(service.get('nope')).rejects.toThrow(NotFoundException);
    });
  });
});
