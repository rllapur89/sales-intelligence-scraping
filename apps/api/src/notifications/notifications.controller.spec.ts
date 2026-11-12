import 'reflect-metadata';
import { BadRequestException } from '@nestjs/common';
import { describe, expect, it, vi } from 'vitest';
import { MARK_READ_TARGET_MESSAGE, NotificationsController } from './notifications.controller';
import type { NotificationsService } from './notifications.service';

const user = { id: 'u1', email: 'a@x.io', role: 'user' as const };

function setup() {
  const service = { list: vi.fn(), unreadCount: vi.fn(), markRead: vi.fn() };
  return {
    service,
    controller: new NotificationsController(service as unknown as NotificationsService),
  };
}

describe('NotificationsController', () => {
  it('lists by the authenticated user id, never a client supplied one', async () => {
    const s = setup();
    const query = { limit: 10, cursor: 'c', unreadOnly: true };
    await s.controller.list(user, query);
    expect(s.service.list).toHaveBeenCalledWith('u1', query);
  });

  it('answers the unread count of the caller', async () => {
    const s = setup();
    s.service.unreadCount.mockResolvedValue({ count: 3 });
    expect(await s.controller.unreadCount(user)).toEqual({ count: 3 });
    expect(s.service.unreadCount).toHaveBeenCalledWith('u1');
  });

  it('marks ids read for the caller and answers 200', async () => {
    const s = setup();
    s.service.markRead.mockResolvedValue({ updated: 1 });
    expect(await s.controller.markRead(user, { ids: ['a'] })).toEqual({ updated: 1 });
    expect(s.service.markRead).toHaveBeenCalledWith('u1', { ids: ['a'] });
    expect(Reflect.getMetadata('__httpCode__', NotificationsController.prototype.markRead)).toBe(
      200,
    );
  });

  it('marks all read', async () => {
    const s = setup();
    await s.controller.markRead(user, { all: true });
    expect(s.service.markRead).toHaveBeenCalledWith('u1', { all: true });
  });

  it.each([
    ['empty body', {}],
    ['empty ids', { ids: [] }],
    ['all: false without ids', { all: false }],
  ])('rejects %s with 400 and touches nothing', (_name, body) => {
    const s = setup();
    expect(() => s.controller.markRead(user, body)).toThrow(BadRequestException);
    expect(() => s.controller.markRead(user, body)).toThrow(MARK_READ_TARGET_MESSAGE);
    expect(s.service.markRead).not.toHaveBeenCalled();
  });
});
