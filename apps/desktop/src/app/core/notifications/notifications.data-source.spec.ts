import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { ENVIRONMENT } from '../config/app-environment';
import { provideDataSources } from '../data/data-sources.provider';
import {
  LiveNotificationsDataSource,
  MockNotificationsDataSource,
  NOTIFICATIONS_PAGE_SIZE,
  NotificationsDataSource,
} from '../data/notifications.data-source';
import { environment } from '../../../environments/environment';

describe('provideDataSources: notifications', () => {
  function resolve(mode: 'mock' | 'live') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources(mode)],
    });
    return TestBed.inject(NotificationsDataSource);
  }

  it('mock mode provides the empty implementation', () => {
    expect(resolve('mock')).toBeInstanceOf(MockNotificationsDataSource);
  });

  it('live mode provides the REST implementation', () => {
    expect(resolve('live')).toBeInstanceOf(LiveNotificationsDataSource);
  });
});

describe('MockNotificationsDataSource', () => {
  const source = new MockNotificationsDataSource();

  it('has no notifications, nothing unread and nothing to mark', async () => {
    expect(await firstValueFrom(source.list())).toEqual({ items: [], nextCursor: null });
    expect(await firstValueFrom(source.unreadCount())).toBe(0);
    expect(await firstValueFrom(source.markRead())).toEqual({ updated: 0 });
  });
});

describe('LiveNotificationsDataSource', () => {
  let source: NotificationsDataSource;
  let http: HttpTestingController;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT, useValue: { ...environment, dataMode: 'live', apiUrl: 'http://api.test/api' } },
        { provide: NotificationsDataSource, useClass: LiveNotificationsDataSource },
      ],
    });
    source = TestBed.inject(NotificationsDataSource);
    http = TestBed.inject(HttpTestingController);
  });

  afterEach(() => http.verify());

  it('lists the first page without a cursor', () => {
    let result: unknown;
    source.list(null).subscribe(r => (result = r));
    const req = http.expectOne(r => r.url === 'http://api.test/api/notifications');
    expect(req.request.method).toBe('GET');
    expect(req.request.params.get('limit')).toBe(String(NOTIFICATIONS_PAGE_SIZE));
    expect(req.request.params.has('cursor')).toBe(false);
    req.flush({ items: [], nextCursor: null });
    expect(result).toEqual({ items: [], nextCursor: null });
  });

  it('sends the cursor for the next page', () => {
    source.list('abc').subscribe();
    const req = http.expectOne(r => r.url === 'http://api.test/api/notifications');
    expect(req.request.params.get('cursor')).toBe('abc');
    req.flush({ items: [], nextCursor: null });
  });

  it('unwraps the unread count', () => {
    let count = -1;
    source.unreadCount().subscribe(c => (count = c));
    const req = http.expectOne('http://api.test/api/notifications/unread-count');
    expect(req.request.method).toBe('GET');
    req.flush({ count: 7 });
    expect(count).toBe(7);
  });

  it('propagates an unread count error', () => {
    let failed = false;
    source.unreadCount().subscribe({ error: () => (failed = true) });
    http.expectOne('http://api.test/api/notifications/unread-count').flush('x', { status: 500, statusText: 'err' });
    expect(failed).toBe(true);
  });

  it('posts ids or all to /notifications/read', () => {
    source.markRead({ ids: ['a'] }).subscribe();
    const first = http.expectOne('http://api.test/api/notifications/read');
    expect(first.request.method).toBe('POST');
    expect(first.request.body).toEqual({ ids: ['a'] });
    first.flush({ updated: 1 });

    source.markRead({ all: true }).subscribe();
    const second = http.expectOne('http://api.test/api/notifications/read');
    expect(second.request.body).toEqual({ all: true });
    second.flush({ updated: 3 });
  });
});
