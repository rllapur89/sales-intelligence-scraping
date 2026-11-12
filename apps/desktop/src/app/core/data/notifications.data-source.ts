import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of } from 'rxjs';
import type {
  MarkReadRequest,
  MarkReadResponse,
  NotificationDto,
  Page,
  UnreadCountDto,
} from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';

/** Notifications fetched per request (keyset pages, newest first). */
export const NOTIFICATIONS_PAGE_SIZE = 20;

/** Where the notification center gets its data from: the REST API, or nothing in mock mode. */
export abstract class NotificationsDataSource {
  abstract list(cursor: string | null): Observable<Page<NotificationDto>>;
  abstract unreadCount(): Observable<number>;
  abstract markRead(request: MarkReadRequest): Observable<MarkReadResponse>;
}

/** Mock mode has no backend and therefore no notifications. */
@Injectable()
export class MockNotificationsDataSource extends NotificationsDataSource {
  list(): Observable<Page<NotificationDto>> {
    return of({ items: [], nextCursor: null });
  }

  unreadCount(): Observable<number> {
    return of(0);
  }

  markRead(): Observable<MarkReadResponse> {
    return of({ updated: 0 });
  }
}

@Injectable()
export class LiveNotificationsDataSource extends NotificationsDataSource {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ENVIRONMENT).apiUrl;

  list(cursor: string | null): Observable<Page<NotificationDto>> {
    let params = new HttpParams().set('limit', NOTIFICATIONS_PAGE_SIZE);
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<Page<NotificationDto>>(`${this.base}/notifications`, { params });
  }

  unreadCount(): Observable<number> {
    return new Observable<number>(subscriber =>
      this.http.get<UnreadCountDto>(`${this.base}/notifications/unread-count`).subscribe({
        next: res => {
          subscriber.next(res.count);
          subscriber.complete();
        },
        error: err => subscriber.error(err),
      })
    );
  }

  markRead(request: MarkReadRequest): Observable<MarkReadResponse> {
    return this.http.post<MarkReadResponse>(`${this.base}/notifications/read`, request);
  }
}
