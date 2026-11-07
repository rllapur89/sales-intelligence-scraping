import { NotFoundException } from '@nestjs/common';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { Subscription } from '@leads/db';
import type { PrismaService } from '../prisma/prisma.service';
import type { SubscriptionNotifier } from './subscription-notifier';
import { SubscriptionsService } from './subscriptions.service';

function row(over: Partial<Subscription> = {}): Subscription {
  return {
    id: 's1',
    userId: 'u1',
    name: 'All leads',
    active: true,
    industries: [],
    regions: [],
    signalTypes: [],
    minScore: 0,
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe('SubscriptionsService', () => {
  const sub = {
    findMany: vi.fn(),
    findFirst: vi.fn(),
    create: vi.fn(),
    update: vi.fn(),
    delete: vi.fn(),
  };
  const userChanged = vi.fn();
  let service: SubscriptionsService;

  beforeEach(() => {
    for (const fn of Object.values(sub)) fn.mockReset();
    userChanged.mockReset();
    service = new SubscriptionsService(
      { subscription: sub } as unknown as PrismaService,
      { userChanged } as unknown as SubscriptionNotifier,
    );
  });

  it('lists only the user rows, mapped to DTOs with shared signal types', async () => {
    sub.findMany.mockResolvedValue([row({ signalTypes: ['OSS_ACTIVITY'], minScore: 40 })]);
    const out = await service.list('u1');
    expect(sub.findMany.mock.calls[0]?.[0]).toMatchObject({ where: { userId: 'u1' } });
    expect(out).toEqual([
      {
        id: 's1',
        name: 'All leads',
        active: true,
        filter: { industries: [], regions: [], signalTypes: ['oss-activity'], minScore: 40 },
      },
    ]);
  });

  it('creates with defaults, maps signal types to the DB enum and notifies', async () => {
    sub.create.mockResolvedValue(row());
    await service.create('u1', { name: 'X', signalTypes: ['website-tech'] });
    expect(sub.create).toHaveBeenCalledWith({
      data: {
        userId: 'u1',
        name: 'X',
        active: true,
        industries: [],
        regions: [],
        signalTypes: ['WEBSITE_TECH'],
        minScore: 0,
      },
    });
    expect(userChanged).toHaveBeenCalledWith('u1');
  });

  it('updates only provided fields after checking ownership', async () => {
    sub.findFirst.mockResolvedValue(row());
    sub.update.mockResolvedValue(row({ active: false }));
    const out = await service.update('u1', 's1', { active: false });
    expect(sub.findFirst).toHaveBeenCalledWith({ where: { id: 's1', userId: 'u1' } });
    expect(sub.update).toHaveBeenCalledWith({ where: { id: 's1' }, data: { active: false } });
    expect(out.active).toBe(false);
    expect(userChanged).toHaveBeenCalledWith('u1');
  });

  it('returns 404 and changes nothing for another user subscription', async () => {
    sub.findFirst.mockResolvedValue(null);
    await expect(service.update('u2', 's1', { name: 'hack' })).rejects.toBeInstanceOf(
      NotFoundException,
    );
    await expect(service.remove('u2', 's1')).rejects.toBeInstanceOf(NotFoundException);
    expect(sub.update).not.toHaveBeenCalled();
    expect(sub.delete).not.toHaveBeenCalled();
    expect(userChanged).not.toHaveBeenCalled();
  });

  it('deletes an owned subscription and notifies', async () => {
    sub.findFirst.mockResolvedValue(row());
    await service.remove('u1', 's1');
    expect(sub.delete).toHaveBeenCalledWith({ where: { id: 's1' } });
    expect(userChanged).toHaveBeenCalledWith('u1');
  });
});
