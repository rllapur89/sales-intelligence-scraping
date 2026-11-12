import { Injectable, Logger } from '@nestjs/common';
import type { Prisma } from '@leads/db';
import {
  fromDbNotificationType,
  toNotificationDto,
  type MarkReadRequest,
  type MarkReadResponse,
  type NotificationDto,
  type NotificationType,
  type Page,
  type UnreadCountDto,
} from '@leads/shared';
import { decodeCursor, encodeCursor } from '../common/cursor';
import { sliceKeysetPage } from '../leads/lead-query';
import { PrismaService } from '../prisma/prisma.service';
import {
  dedupeCutoff,
  decideNewMatches,
  decideRetractions,
  type NotificationCandidate,
} from './notification-rules';

export const NOTIFICATIONS_ORDER_BY: Prisma.NotificationOrderByWithRelationInput[] = [
  { createdAt: 'desc' },
  { id: 'desc' },
];

export function notificationCursorFor(row: { id: string; createdAt: Date }): string {
  return encodeCursor('created', { value: row.createdAt.toISOString(), id: row.id });
}

/** Rows of the user strictly after the cursor (newest first), optionally only unread ones. */
export function buildNotificationPageWhere(
  userId: string,
  unreadOnly: boolean,
  cursor?: string,
): Prisma.NotificationWhereInput {
  const base: Prisma.NotificationWhereInput = { userId, ...(unreadOnly && { readAt: null }) };
  if (!cursor) return base;
  const pos = decodeCursor(cursor, 'created');
  const at = new Date(pos.value as string);
  return { ...base, OR: [{ createdAt: { lt: at } }, { createdAt: at, id: { lt: pos.id } }] };
}

/** What one dispatch window means for one user's notifications. */
export interface WindowNotifications {
  matches: NotificationCandidate[];
  retractions: NotificationCandidate[];
}

@Injectable()
export class NotificationsService {
  private readonly logger = new Logger(NotificationsService.name);

  constructor(private readonly prisma: PrismaService) {}

  async list(
    userId: string,
    query: { limit: number; cursor?: string; unreadOnly?: boolean },
  ): Promise<Page<NotificationDto>> {
    const rows = await this.prisma.notification.findMany({
      where: buildNotificationPageWhere(userId, query.unreadOnly ?? false, query.cursor),
      orderBy: NOTIFICATIONS_ORDER_BY,
      take: query.limit + 1,
    });
    const page = sliceKeysetPage(rows, query.limit, notificationCursorFor);
    return { items: page.items.map(toNotificationDto), nextCursor: page.nextCursor };
  }

  async unreadCount(userId: string): Promise<UnreadCountDto> {
    return { count: await this.prisma.notification.count({ where: { userId, readAt: null } }) };
  }

  /** Marks the caller's own rows read; foreign or unknown ids are ignored. */
  async markRead(
    userId: string,
    request: MarkReadRequest,
    now = new Date(),
  ): Promise<MarkReadResponse> {
    const result = await this.prisma.notification.updateMany({
      where: {
        userId,
        readAt: null,
        ...(request.all === true ? {} : { id: { in: request.ids ?? [] } }),
      },
      data: { readAt: now },
    });
    return { updated: result.count };
  }

  /**
   * Fire and forget entry point of the live hub: never throws and never blocks delivery. One call
   * per user and dispatch window, so the DB work is batched.
   */
  handleWindow(userId: string, window: WindowNotifications, now = new Date()): void {
    if (window.matches.length === 0 && window.retractions.length === 0) return;
    this.record(userId, window, now).catch((err: unknown) =>
      this.logger.warn(`Creating notifications failed: ${String(err)}`),
    );
  }

  async record(userId: string, window: WindowNotifications, now: Date): Promise<number> {
    const created =
      (await this.recordMatches(userId, window.matches, now)) +
      (await this.recordRetractions(userId, window.retractions, now));
    return created;
  }

  async recordMatches(
    userId: string,
    candidates: readonly NotificationCandidate[],
    now: Date,
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const recent = await this.prisma.notification.findMany({
      where: {
        userId,
        type: 'NEW_MATCH',
        leadId: { in: candidates.map((c) => c.leadId) },
        createdAt: { gt: dedupeCutoff(now) },
      },
      orderBy: { createdAt: 'desc' },
      select: { leadId: true, createdAt: true },
    });
    const lastNotified = new Map<string, Date>();
    for (const row of recent)
      if (!lastNotified.has(row.leadId)) lastNotified.set(row.leadId, row.createdAt);
    const fresh = decideNewMatches(candidates, lastNotified, now);
    if (fresh.length === 0) return 0;
    const result = await this.prisma.notification.createMany({
      data: fresh.map((c) => ({
        userId,
        type: 'NEW_MATCH' as const,
        leadId: c.leadId,
        title: c.title,
        createdAt: now,
      })),
    });
    return result.count;
  }

  async recordRetractions(
    userId: string,
    candidates: readonly NotificationCandidate[],
    now: Date,
  ): Promise<number> {
    if (candidates.length === 0) return 0;
    const latest = await this.prisma.notification.findMany({
      where: { userId, leadId: { in: candidates.map((c) => c.leadId) } },
      orderBy: { createdAt: 'desc' },
      distinct: ['leadId'],
      select: { leadId: true, type: true },
    });
    const latestType = new Map<string, NotificationType>(
      latest.map((row) => [row.leadId, fromDbNotificationType(row.type)]),
    );
    const due = decideRetractions(candidates, latestType);
    if (due.length === 0) return 0;
    const result = await this.prisma.notification.createMany({
      data: due.map((c) => ({
        userId,
        type: 'RETRACTED' as const,
        leadId: c.leadId,
        title: c.title,
        createdAt: now,
      })),
    });
    return result.count;
  }
}
