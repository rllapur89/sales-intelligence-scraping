import { Injectable, NotFoundException } from '@nestjs/common';
import type { Subscription } from '@leads/db';
import type { SubscriptionDto, SubscriptionFilter } from '@leads/shared';
import { fromDbSignalType, toDbSignalType } from '../common/mappers';
import { PrismaService } from '../prisma/prisma.service';
import type { CreateSubscriptionDto, UpdateSubscriptionDto } from './subscriptions.dto';
import { SubscriptionNotifier } from './subscription-notifier';

export function toSubscriptionFilter(row: Subscription): SubscriptionFilter {
  return {
    industries: row.industries,
    regions: row.regions,
    signalTypes: row.signalTypes.map(fromDbSignalType),
    minScore: row.minScore,
  };
}

export function toSubscriptionDto(row: Subscription): SubscriptionDto {
  return { id: row.id, name: row.name, active: row.active, filter: toSubscriptionFilter(row) };
}

@Injectable()
export class SubscriptionsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly notifier: SubscriptionNotifier,
  ) {}

  async list(userId: string): Promise<SubscriptionDto[]> {
    const rows = await this.prisma.subscription.findMany({
      where: { userId },
      orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
    });
    return rows.map(toSubscriptionDto);
  }

  async create(userId: string, body: CreateSubscriptionDto): Promise<SubscriptionDto> {
    const row = await this.prisma.subscription.create({
      data: {
        userId,
        name: body.name,
        active: body.active ?? true,
        industries: body.industries ?? [],
        regions: body.regions ?? [],
        signalTypes: (body.signalTypes ?? []).map(toDbSignalType),
        minScore: body.minScore ?? 0,
      },
    });
    await this.notifier.userChanged(userId);
    return toSubscriptionDto(row);
  }

  async update(userId: string, id: string, body: UpdateSubscriptionDto): Promise<SubscriptionDto> {
    await this.requireOwned(userId, id);
    const row = await this.prisma.subscription.update({
      where: { id },
      data: {
        ...(body.name !== undefined && { name: body.name }),
        ...(body.active !== undefined && { active: body.active }),
        ...(body.industries !== undefined && { industries: body.industries }),
        ...(body.regions !== undefined && { regions: body.regions }),
        ...(body.signalTypes !== undefined && {
          signalTypes: body.signalTypes.map(toDbSignalType),
        }),
        ...(body.minScore !== undefined && { minScore: body.minScore }),
      },
    });
    await this.notifier.userChanged(userId);
    return toSubscriptionDto(row);
  }

  async remove(userId: string, id: string): Promise<void> {
    await this.requireOwned(userId, id);
    await this.prisma.subscription.delete({ where: { id } });
    await this.notifier.userChanged(userId);
  }

  /** Another user's id is indistinguishable from a missing one (404). */
  private async requireOwned(userId: string, id: string): Promise<void> {
    const row = await this.prisma.subscription.findFirst({ where: { id, userId } });
    if (!row) throw new NotFoundException(`Subscription ${id} not found`);
  }
}
