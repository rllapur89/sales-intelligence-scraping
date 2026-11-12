import { InjectionToken, inject } from '@angular/core';
import type { NotificationDto } from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';

/** How often the unread count is polled when the environment does not say otherwise. */
export const DEFAULT_NOTIFICATIONS_POLL_MS = 30_000;
/** Lower bound so a bad value cannot hammer the API. */
export const MIN_NOTIFICATIONS_POLL_MS = 1_000;

/** Reads `notificationsPollMs` from the environment; anything invalid falls back to 30 s. Pure. */
export function resolvePollMs(env: object): number {
  const value = (env as { notificationsPollMs?: unknown }).notificationsPollMs;
  return typeof value === 'number' && Number.isFinite(value) && value >= MIN_NOTIFICATIONS_POLL_MS
    ? Math.floor(value)
    : DEFAULT_NOTIFICATIONS_POLL_MS;
}

export const NOTIFICATIONS_POLL_MS = new InjectionToken<number>('NOTIFICATIONS_POLL_MS', {
  providedIn: 'root',
  factory: () => resolvePollMs(inject(ENVIRONMENT)),
});

/** Text of the unread badge: empty at 0, capped at `99+`. */
export function badgeText(count: number): string {
  if (!Number.isFinite(count) || count <= 0) return '';
  return count > 99 ? '99+' : String(Math.floor(count));
}

/** Accessible name of the bell button, including the unread count. */
export function bellLabel(count: number): string {
  const n = Number.isFinite(count) && count > 0 ? Math.floor(count) : 0;
  return `Notifications, ${n > 99 ? 'more than 99' : n} unread`;
}

export function notificationText(n: Pick<NotificationDto, 'type' | 'title'>): string {
  return n.type === 'retracted'
    ? `${n.title} no longer matches your subscriptions`
    : `New match: ${n.title}`;
}

/** "just now", "5 min ago", "3 h ago", "2 d ago". Pure. */
export function formatAgo(iso: string, now: number): string {
  const at = Date.parse(iso);
  if (Number.isNaN(at)) return '';
  const minutes = Math.floor(Math.max(0, now - at) / 60_000);
  if (minutes < 1) return 'just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.floor(hours / 24)} d ago`;
}

/** Marks the given ids (or everything with `ids === 'all'`) read, keeping already read rows as is. */
export function markedRead(
  items: readonly NotificationDto[],
  ids: readonly string[] | 'all',
  readAt: string,
): NotificationDto[] {
  const wanted = ids === 'all' ? null : new Set(ids);
  return items.map(n => (n.readAt === null && (!wanted || wanted.has(n.id)) ? { ...n, readAt } : n));
}

export function countUnread(items: readonly NotificationDto[]): number {
  return items.reduce((sum, n) => sum + (n.readAt === null ? 1 : 0), 0);
}

/** Appends a page without repeating rows already shown. */
export function appendPage(
  current: readonly NotificationDto[],
  page: readonly NotificationDto[]
): NotificationDto[] {
  const seen = new Set(current.map(n => n.id));
  return [...current, ...page.filter(n => !seen.has(n.id))];
}
