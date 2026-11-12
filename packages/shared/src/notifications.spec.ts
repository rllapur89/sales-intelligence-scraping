import { describe, expect, it } from 'vitest';
import {
  NOTIFICATION_TYPES,
  NOTIFY_DEDUPE_WINDOW_MS,
  NOTIFY_MIN_SCORE,
  fromDbNotificationType,
  toDbNotificationType,
  toNotificationDto,
} from './notifications';

describe('notification types', () => {
  it('maps the Prisma enum both ways for every type', () => {
    expect(fromDbNotificationType('NEW_MATCH')).toBe('new_match');
    expect(fromDbNotificationType('RETRACTED')).toBe('retracted');
    for (const type of NOTIFICATION_TYPES) {
      expect(fromDbNotificationType(toDbNotificationType(type))).toBe(type);
    }
  });

  it('exposes the documented limits', () => {
    expect(NOTIFY_MIN_SCORE).toBe(70);
    expect(NOTIFY_DEDUPE_WINDOW_MS).toBe(86_400_000);
  });
});

describe('toNotificationDto', () => {
  const base = {
    id: 'n1',
    type: 'NEW_MATCH',
    leadId: 'l1',
    title: 'Acme',
    createdAt: new Date('2026-02-02T10:00:00.000Z'),
    readAt: null,
  };

  it('maps an unread row', () => {
    expect(toNotificationDto(base)).toEqual({
      id: 'n1',
      type: 'new_match',
      leadId: 'l1',
      title: 'Acme',
      createdAt: '2026-02-02T10:00:00.000Z',
      readAt: null,
    });
  });

  it('maps a read row and drops unknown row fields', () => {
    const dto = toNotificationDto({
      ...base,
      type: 'RETRACTED',
      readAt: new Date('2026-02-02T11:00:00.000Z'),
      userId: 'u1',
    } as typeof base);
    expect(dto.type).toBe('retracted');
    expect(dto.readAt).toBe('2026-02-02T11:00:00.000Z');
    expect(Object.keys(dto).sort()).toEqual(
      ['createdAt', 'id', 'leadId', 'readAt', 'title', 'type'].sort(),
    );
  });
});
