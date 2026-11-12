import { Injectable, inject, signal } from '@angular/core';
import { Actions, ofType } from '@ngrx/effects';
import { Subscription, debounceTime, timer } from 'rxjs';
import type { NotificationDto } from '@leads/shared';
import { DATA_MODE } from '../config/app-environment';
import { NotificationsDataSource } from '../data/notifications.data-source';
import { LeadsActions } from '../store/leads/leads.actions';
import { errorMessage } from '../util/errors';
import {
  NOTIFICATIONS_POLL_MS,
  appendPage,
  countUnread,
  markedRead,
} from './notifications-view';

/** After a retraction the server needs a moment to write its notification: refresh a bit later. */
export const RETRACTION_REFRESH_DELAY_MS = 1500;

/**
 * State of the notification center. Live mode polls the unread count (every `NOTIFICATIONS_POLL_MS`)
 * and refreshes sooner when a `leads:retracted` hint arrives. Mock mode never talks to anything.
 */
@Injectable({ providedIn: 'root' })
export class NotificationsService {
  private readonly source = inject(NotificationsDataSource);
  private readonly actions$ = inject(Actions);
  private readonly pollMs = inject(NOTIFICATIONS_POLL_MS);
  /** Notifications exist only in live mode. */
  readonly enabled = inject(DATA_MODE) === 'live';

  readonly items = signal<NotificationDto[]>([]);
  readonly unreadCount = signal(0);
  readonly loading = signal(false);
  readonly loadingMore = signal(false);
  readonly error = signal<string | null>(null);
  readonly hasMore = signal(false);

  private nextCursor: string | null = null;
  private listLoaded = false;
  private running: Subscription | null = null;
  /** Bumped by every list load so a slow, older response cannot overwrite a newer one. */
  private listVersion = 0;

  /** Starts polling (idempotent, no-op in mock mode). */
  start(): void {
    if (!this.enabled || this.running) return;
    const subscription = new Subscription();
    this.refreshCount();
    subscription.add(timer(this.pollMs, this.pollMs).subscribe(() => this.refreshCount()));
    subscription.add(
      this.actions$
        .pipe(ofType(LeadsActions.retractLeads), debounceTime(RETRACTION_REFRESH_DELAY_MS))
        .subscribe(() => this.refreshCount())
    );
    this.running = subscription;
  }

  stop(): void {
    this.running?.unsubscribe();
    this.running = null;
  }

  /** Reads the unread count; when it changed and the list is open data, reloads the list too. */
  refreshCount(): void {
    if (!this.enabled) return;
    this.source.unreadCount().subscribe({
      next: count => {
        const changed = count !== this.unreadCount();
        this.unreadCount.set(count);
        if (changed && this.listLoaded) this.loadList();
      },
      // A failed poll keeps the last known count; the next tick tries again.
      error: () => undefined,
    });
  }

  /** (Re)loads the first page of the list. */
  loadList(): void {
    if (!this.enabled) return;
    const version = ++this.listVersion;
    this.loading.set(true);
    this.error.set(null);
    this.source.list(null).subscribe({
      next: page => {
        if (version !== this.listVersion) return;
        this.items.set(page.items);
        this.nextCursor = page.nextCursor;
        this.hasMore.set(page.nextCursor !== null);
        this.listLoaded = true;
        this.loading.set(false);
      },
      error: err => {
        if (version !== this.listVersion) return;
        this.error.set(errorMessage(err, 'Could not load notifications'));
        this.loading.set(false);
      },
    });
  }

  loadMore(): void {
    if (!this.enabled || !this.nextCursor || this.loadingMore()) return;
    const version = this.listVersion;
    this.loadingMore.set(true);
    this.source.list(this.nextCursor).subscribe({
      next: page => {
        if (version !== this.listVersion) return;
        this.items.update(current => appendPage(current, page.items));
        this.nextCursor = page.nextCursor;
        this.hasMore.set(page.nextCursor !== null);
        this.loadingMore.set(false);
      },
      error: err => {
        this.error.set(errorMessage(err, 'Could not load more notifications'));
        this.loadingMore.set(false);
      },
    });
  }

  markRead(ids: string[]): void {
    this.mark({ ids }, markedRead(this.items(), ids, new Date().toISOString()));
  }

  markAllRead(): void {
    this.mark({ all: true }, markedRead(this.items(), 'all', new Date().toISOString()));
  }

  /** Optimistic: the list updates at once, the count is re-read from the server afterwards. */
  private mark(request: { ids?: string[]; all?: boolean }, next: NotificationDto[]): void {
    if (!this.enabled) return;
    const before = this.items();
    const unreadBefore = this.unreadCount();
    const removed = countUnread(before) - countUnread(next);
    this.items.set(next);
    this.unreadCount.set(request.all ? 0 : Math.max(0, unreadBefore - removed));
    this.source.markRead(request).subscribe({
      next: () => this.refreshCount(),
      error: err => {
        this.items.set(before);
        this.unreadCount.set(unreadBefore);
        this.error.set(errorMessage(err, 'Could not mark notifications as read'));
      },
    });
  }
}
