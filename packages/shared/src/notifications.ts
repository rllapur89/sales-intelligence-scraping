/**
 * In-app notification DTOs and the pure helpers behind them. A notification only carries the
 * company name (`title`) and the lead id: never personal data. Dates travel as ISO-8601 strings.
 */

export const NOTIFICATION_TYPES = ['new_match', 'retracted'] as const;
export type NotificationType = (typeof NOTIFICATION_TYPES)[number];

/** A lead must score at least this much to raise a `new_match` notification. */
export const NOTIFY_MIN_SCORE = 70;
/** At most one `new_match` notification per user and lead inside this window. */
export const NOTIFY_DEDUPE_WINDOW_MS = 24 * 60 * 60 * 1000;
/** Most ids accepted by one `POST /notifications/read`. */
export const NOTIFICATIONS_READ_MAX_IDS = 200;

export interface NotificationDto {
  id: string;
  type: NotificationType;
  leadId: string;
  /** Company name. */
  title: string;
  createdAt: string;
  /** Null while unread. */
  readAt: string | null;
}

export interface UnreadCountDto {
  count: number;
}

/** Body of `POST /notifications/read`: either specific ids or `all: true`. */
export interface MarkReadRequest {
  ids?: string[];
  all?: boolean;
}

export interface MarkReadResponse {
  /** Rows that changed from unread to read. */
  updated: number;
}

export interface DbNotificationRow {
  id: string;
  /** Prisma enum, `NEW_MATCH`. */
  type: string;
  leadId: string;
  title: string;
  createdAt: Date;
  readAt: Date | null;
}

/** `NEW_MATCH` -> `new_match`. */
export const fromDbNotificationType = (type: string): NotificationType =>
  type.toLowerCase() as NotificationType;

export const toDbNotificationType = (type: NotificationType): string => type.toUpperCase();

export function toNotificationDto(row: DbNotificationRow): NotificationDto {
  return {
    id: row.id,
    type: fromDbNotificationType(row.type),
    leadId: row.leadId,
    title: row.title,
    createdAt: row.createdAt.toISOString(),
    readAt: row.readAt?.toISOString() ?? null,
  };
}
