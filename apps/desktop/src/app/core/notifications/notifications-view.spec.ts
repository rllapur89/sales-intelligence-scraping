import type { NotificationDto } from '@leads/shared';
import {
  DEFAULT_NOTIFICATIONS_POLL_MS,
  appendPage,
  badgeText,
  bellLabel,
  countUnread,
  formatAgo,
  markedRead,
  notificationText,
  resolvePollMs,
} from './notifications-view';

const n = (id: string, readAt: string | null = null): NotificationDto => ({
  id,
  type: 'new_match',
  leadId: `lead-${id}`,
  title: `Company ${id}`,
  createdAt: '2026-02-02T10:00:00.000Z',
  readAt,
});

describe('resolvePollMs', () => {
  it('defaults to 30 seconds', () => {
    expect(DEFAULT_NOTIFICATIONS_POLL_MS).toBe(30_000);
    expect(resolvePollMs({})).toBe(30_000);
  });

  it('uses a valid environment value', () => {
    expect(resolvePollMs({ notificationsPollMs: 5000 })).toBe(5000);
    expect(resolvePollMs({ notificationsPollMs: 1000 })).toBe(1000);
  });

  it.each([[0], [999], [-5], [Number.NaN], [Infinity], ['5000'], [null]])(
    'falls back for the invalid value %s',
    value => {
      expect(resolvePollMs({ notificationsPollMs: value })).toBe(30_000);
    }
  );
});

describe('badgeText / bellLabel', () => {
  it('hides the badge at zero and caps it at 99+', () => {
    expect(badgeText(0)).toBe('');
    expect(badgeText(-3)).toBe('');
    expect(badgeText(Number.NaN)).toBe('');
    expect(badgeText(1)).toBe('1');
    expect(badgeText(99)).toBe('99');
    expect(badgeText(100)).toBe('99+');
  });

  it('always includes the unread count in the accessible name', () => {
    expect(bellLabel(0)).toBe('Notifications, 0 unread');
    expect(bellLabel(3)).toBe('Notifications, 3 unread');
    expect(bellLabel(250)).toBe('Notifications, more than 99 unread');
  });
});

describe('notificationText', () => {
  it('describes both types with the company name only', () => {
    expect(notificationText({ type: 'new_match', title: 'Acme' })).toBe('New match: Acme');
    expect(notificationText({ type: 'retracted', title: 'Acme' })).toBe(
      'Acme no longer matches your subscriptions'
    );
  });
});

describe('formatAgo', () => {
  const now = Date.parse('2026-02-02T12:00:00.000Z');
  const ago = (ms: number) => new Date(now - ms).toISOString();

  it('formats minutes, hours and days', () => {
    expect(formatAgo(ago(10_000), now)).toBe('just now');
    expect(formatAgo(ago(5 * 60_000), now)).toBe('5 min ago');
    expect(formatAgo(ago(3 * 3_600_000 + 5000), now)).toBe('3 h ago');
    expect(formatAgo(ago(49 * 3_600_000), now)).toBe('2 d ago');
  });

  it('treats the future as just now and bad input as empty', () => {
    expect(formatAgo(new Date(now + 60_000).toISOString(), now)).toBe('just now');
    expect(formatAgo('nope', now)).toBe('');
  });
});

describe('markedRead / countUnread', () => {
  const items = [n('a'), n('b', '2026-02-02T09:00:00.000Z'), n('c')];

  it('marks only the given unread ids', () => {
    const out = markedRead(items, ['a'], 'NOW');
    expect(out.map(i => i.readAt)).toEqual(['NOW', '2026-02-02T09:00:00.000Z', null]);
    expect(items[0].readAt).toBeNull();
  });

  it('marks every unread row for "all" and keeps earlier read times', () => {
    const out = markedRead(items, 'all', 'NOW');
    expect(out.map(i => i.readAt)).toEqual(['NOW', '2026-02-02T09:00:00.000Z', 'NOW']);
    expect(countUnread(out)).toBe(0);
  });

  it('counts unread rows', () => {
    expect(countUnread(items)).toBe(2);
    expect(countUnread([])).toBe(0);
  });
});

describe('appendPage', () => {
  it('appends a page without repeating rows', () => {
    expect(appendPage([n('a'), n('b')], [n('b'), n('c')]).map(i => i.id)).toEqual(['a', 'b', 'c']);
  });
});
