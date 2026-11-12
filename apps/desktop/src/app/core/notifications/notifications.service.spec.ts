import { TestBed } from '@angular/core/testing';
import { Actions } from '@ngrx/effects';
import { Action } from '@ngrx/store';
import { Observable, Subject, of, throwError } from 'rxjs';
import type { MarkReadRequest, NotificationDto, Page } from '@leads/shared';
import { DATA_MODE } from '../config/app-environment';
import { NotificationsDataSource } from '../data/notifications.data-source';
import { LeadsActions } from '../store/leads/leads.actions';
import { RETRACTION_REFRESH_DELAY_MS, NotificationsService } from './notifications.service';
import { NOTIFICATIONS_POLL_MS } from './notifications-view';

const n = (id: string, readAt: string | null = null): NotificationDto => ({
  id,
  type: 'new_match',
  leadId: `lead-${id}`,
  title: `Company ${id}`,
  createdAt: '2026-02-02T10:00:00.000Z',
  readAt,
});

const page = (items: NotificationDto[], nextCursor: string | null = null): Page<NotificationDto> => ({
  items,
  nextCursor,
});

interface FakeSource {
  list: ReturnType<typeof vi.fn<(cursor: string | null) => Observable<Page<NotificationDto>>>>;
  unreadCount: ReturnType<typeof vi.fn<() => Observable<number>>>;
  markRead: ReturnType<typeof vi.fn<(r: MarkReadRequest) => Observable<{ updated: number }>>>;
}

describe('NotificationsService', () => {
  let source: FakeSource;
  let actions$: Subject<Action>;

  function create(mode: 'live' | 'mock' = 'live', pollMs = 30_000): NotificationsService {
    source = {
      list: vi.fn(() => of(page([n('a'), n('b')]))),
      unreadCount: vi.fn(() => of(2)),
      markRead: vi.fn(() => of({ updated: 1 })),
    };
    actions$ = new Subject<Action>();
    TestBed.configureTestingModule({
      providers: [
        { provide: NotificationsDataSource, useValue: source },
        { provide: Actions, useValue: new Actions(actions$) },
        { provide: DATA_MODE, useValue: mode },
        { provide: NOTIFICATIONS_POLL_MS, useValue: pollMs },
      ],
    });
    return TestBed.inject(NotificationsService);
  }

  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  describe('polling', () => {
    it('reads the unread count at once and then every poll interval', () => {
      const service = create('live', 10_000);
      service.start();
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
      expect(service.unreadCount()).toBe(2);
      vi.advanceTimersByTime(10_000);
      expect(source.unreadCount).toHaveBeenCalledTimes(2);
      vi.advanceTimersByTime(20_000);
      expect(source.unreadCount).toHaveBeenCalledTimes(4);
      service.stop();
    });

    it('start() twice polls once, and stop() ends the polling', () => {
      const service = create('live', 10_000);
      service.start();
      service.start();
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
      service.stop();
      vi.advanceTimersByTime(60_000);
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
    });

    it('keeps the last count when a poll fails', () => {
      const service = create('live', 10_000);
      service.start();
      source.unreadCount.mockReturnValue(throwError(() => new Error('offline')));
      vi.advanceTimersByTime(10_000);
      expect(service.unreadCount()).toBe(2);
      service.stop();
    });

    it('refreshes the count shortly after a leads:retracted hint, once for a burst', () => {
      const service = create('live', 600_000);
      service.start();
      source.unreadCount.mockClear();
      actions$.next(LeadsActions.retractLeads({ leadIds: ['a'], seq: 1 }));
      actions$.next(LeadsActions.retractLeads({ leadIds: ['b'], seq: 2 }));
      vi.advanceTimersByTime(RETRACTION_REFRESH_DELAY_MS - 1);
      expect(source.unreadCount).not.toHaveBeenCalled();
      vi.advanceTimersByTime(1);
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('reloads an already loaded list when the unread count changes', () => {
      const service = create('live', 10_000);
      service.start();
      service.loadList();
      source.list.mockClear();
      source.unreadCount.mockReturnValue(of(3));
      vi.advanceTimersByTime(10_000);
      expect(source.list).toHaveBeenCalledTimes(1);
      service.stop();
    });

    it('does not load the list on a count change while it was never opened', () => {
      const service = create('live', 10_000);
      service.start();
      source.unreadCount.mockReturnValue(of(5));
      vi.advanceTimersByTime(10_000);
      expect(source.list).not.toHaveBeenCalled();
      service.stop();
    });
  });

  describe('mock mode', () => {
    it('is disabled and never calls the data source', () => {
      const service = create('mock');
      service.start();
      service.loadList();
      service.loadMore();
      service.markRead(['a']);
      service.markAllRead();
      service.refreshCount();
      expect(service.enabled).toBe(false);
      expect(source.unreadCount).not.toHaveBeenCalled();
      expect(source.list).not.toHaveBeenCalled();
      expect(source.markRead).not.toHaveBeenCalled();
      expect(service.items()).toEqual([]);
      expect(service.unreadCount()).toBe(0);
    });
  });

  describe('list', () => {
    it('loads the first page and remembers there is more', () => {
      const service = create();
      source.list.mockReturnValue(of(page([n('a')], 'next')));
      service.loadList();
      expect(source.list).toHaveBeenCalledWith(null);
      expect(service.items().map(i => i.id)).toEqual(['a']);
      expect(service.hasMore()).toBe(true);
      expect(service.loading()).toBe(false);
    });

    it('appends the next page with the cursor and skips repeated rows', () => {
      const service = create();
      source.list.mockReturnValueOnce(of(page([n('a')], 'c1'))).mockReturnValueOnce(of(page([n('a'), n('b')])));
      service.loadList();
      service.loadMore();
      expect(source.list).toHaveBeenLastCalledWith('c1');
      expect(service.items().map(i => i.id)).toEqual(['a', 'b']);
      expect(service.hasMore()).toBe(false);
    });

    it('loadMore does nothing without a next page', () => {
      const service = create();
      service.loadList();
      source.list.mockClear();
      service.loadMore();
      expect(source.list).not.toHaveBeenCalled();
    });

    it('reports a load error', () => {
      const service = create();
      source.list.mockReturnValue(throwError(() => new Error('boom')));
      service.loadList();
      expect(service.error()).toBe('boom');
      expect(service.loading()).toBe(false);
    });

    it('ignores an older response that arrives after a newer load', () => {
      const service = create();
      const slow = new Subject<Page<NotificationDto>>();
      source.list.mockReturnValueOnce(slow).mockReturnValueOnce(of(page([n('new')])));
      service.loadList();
      service.loadList();
      slow.next(page([n('old')]));
      expect(service.items().map(i => i.id)).toEqual(['new']);
    });
  });

  describe('marking as read', () => {
    function loaded(count = 2): NotificationsService {
      const service = create();
      source.unreadCount.mockReturnValue(of(count));
      service.refreshCount();
      service.loadList();
      return service;
    }

    it('marks one notification optimistically and tells the server', () => {
      const service = loaded();
      source.unreadCount.mockReturnValue(of(1));
      service.markRead(['a']);
      expect(source.markRead).toHaveBeenCalledWith({ ids: ['a'] });
      expect(service.items().find(i => i.id === 'a')?.readAt).not.toBeNull();
      expect(service.items().find(i => i.id === 'b')?.readAt).toBeNull();
    });

    it('re-reads the count from the server afterwards', () => {
      const service = loaded();
      source.unreadCount.mockClear();
      source.unreadCount.mockReturnValue(of(1));
      service.markRead(['a']);
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
      expect(service.unreadCount()).toBe(1);
    });

    it('marks everything with all: true and zeroes the count', () => {
      const service = loaded();
      source.unreadCount.mockReturnValue(of(0));
      service.markAllRead();
      expect(source.markRead).toHaveBeenCalledWith({ all: true });
      expect(service.items().every(i => i.readAt !== null)).toBe(true);
      expect(service.unreadCount()).toBe(0);
    });

    it('rolls back the list and the count when the request fails', () => {
      const service = loaded();
      source.markRead.mockReturnValue(throwError(() => new Error('nope')));
      service.markRead(['a']);
      expect(service.items().find(i => i.id === 'a')?.readAt).toBeNull();
      expect(service.unreadCount()).toBe(2);
      expect(service.error()).toBe('nope');
    });
  });
});
