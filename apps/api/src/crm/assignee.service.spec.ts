import { BadRequestException, NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../prisma/prisma.service';
import { AssigneeService } from './assignee.service';

const actor = { id: 'u1', email: 'a@x.io', role: 'user' as const };
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
const lead = (assigneeId: string | null) => ({
  id: 'l1',
  companyId: 'c1',
  score: 50,
  stage: 'NEW',
  signalTypes: [],
  signalCount: 0,
  seq: 1n,
  assigneeId,
  updatedAt: new Date('2026-02-01T10:00:00.000Z'),
  company,
});

describe('AssigneeService', () => {
  const db = {
    lead: { findUnique: vi.fn(), update: vi.fn() },
    user: { findUnique: vi.fn() },
    leadActivity: { create: vi.fn() },
    $transaction: vi.fn(),
  };
  let service: AssigneeService;

  beforeEach(() => {
    db.lead.findUnique.mockReset();
    db.lead.update.mockReset();
    db.user.findUnique.mockReset().mockResolvedValue({ id: 'u2' });
    db.leadActivity.create.mockReset();
    db.$transaction.mockReset().mockImplementation((fn: (tx: typeof db) => unknown) => fn(db));
    service = new AssigneeService(db as unknown as PrismaService);
  });

  it('assigns and records assigned with previous and new owner', async () => {
    db.lead.findUnique.mockResolvedValue(lead(null));
    db.lead.update.mockResolvedValue(lead('u2'));
    const dto = await service.assign('l1', actor, 'u2');
    expect(db.lead.update).toHaveBeenCalledWith({
      where: { id: 'l1' },
      data: { assigneeId: 'u2' },
      include: { company: true },
    });
    expect(db.leadActivity.create).toHaveBeenCalledWith({
      data: { leadId: 'l1', actorId: 'u1', type: 'ASSIGNED', data: { from: null, to: 'u2' } },
    });
    expect(dto.assigneeId).toBe('u2');
  });

  it('unassigns with null without checking users', async () => {
    db.lead.findUnique.mockResolvedValue(lead('u2'));
    db.lead.update.mockResolvedValue(lead(null));
    const dto = await service.assign('l1', actor, null);
    expect(db.user.findUnique).not.toHaveBeenCalled();
    expect(db.leadActivity.create.mock.calls[0]?.[0].data.data).toEqual({ from: 'u2', to: null });
    expect(dto.assigneeId).toBeNull();
  });

  it('is a no-op when the owner does not change', async () => {
    db.lead.findUnique.mockResolvedValue(lead('u2'));
    const dto = await service.assign('l1', actor, 'u2');
    expect(db.$transaction).not.toHaveBeenCalled();
    expect(db.leadActivity.create).not.toHaveBeenCalled();
    expect(dto.assigneeId).toBe('u2');
  });

  it('400s for an unknown user and leaves the lead untouched', async () => {
    db.lead.findUnique.mockResolvedValue(lead(null));
    db.user.findUnique.mockResolvedValue(null);
    await expect(service.assign('l1', actor, 'ghost')).rejects.toThrow(BadRequestException);
    expect(db.lead.update).not.toHaveBeenCalled();
    expect(db.leadActivity.create).not.toHaveBeenCalled();
  });

  it('404s for an unknown lead', async () => {
    db.lead.findUnique.mockResolvedValue(null);
    await expect(service.assign('nope', actor, 'u2')).rejects.toThrow(NotFoundException);
  });
});
