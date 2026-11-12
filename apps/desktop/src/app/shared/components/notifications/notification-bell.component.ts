import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  HostListener,
  Injector,
  afterNextRender,
  computed,
  inject,
  signal,
  viewChild,
} from '@angular/core';
import { Router } from '@angular/router';
import { Store } from '@ngrx/store';
import type { NotificationDto } from '@leads/shared';
import { NotificationsService } from '../../../core/notifications/notifications.service';
import {
  badgeText,
  bellLabel,
  formatAgo,
  notificationText,
} from '../../../core/notifications/notifications-view';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { selectLeadEntities } from '../../../core/store/leads/leads.selectors';
import { ToastService } from '../../services/toast.service';

/**
 * Bell with an unread badge and a dropdown list of notifications (live mode). Keyboard: Enter/Space
 * opens, Arrow keys/Home/End move between items, Escape closes and returns focus to the bell.
 */
@Component({
  selector: 'app-notification-bell',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="relative">
      <button
        #bell
        type="button"
        data-testid="notification-bell"
        class="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-blue-500"
        [attr.aria-label]="label()"
        aria-haspopup="dialog"
        aria-controls="notification-panel"
        [attr.aria-expanded]="open()"
        (click)="toggle()"
      >
        <span class="text-lg" aria-hidden="true">🔔</span>
      </button>
      <span
        data-testid="notification-badge"
        aria-live="polite"
        aria-atomic="true"
        class="pointer-events-none absolute -top-0.5 -right-0.5 min-w-4 h-4 px-1 rounded-full bg-blue-500 text-white text-[10px] font-bold leading-4 text-center"
        [class.hidden]="!badge()"
        >{{ badge() }}</span
      >

      @if (open()) {
        <div
          id="notification-panel"
          role="dialog"
          aria-label="Notifications"
          data-testid="notification-panel"
          class="absolute right-0 mt-2 w-96 max-w-[90vw] bg-slate-800 border border-slate-700 rounded-xl shadow-xl z-50"
          (keydown)="onPanelKeydown($event)"
        >
          <div class="flex items-center justify-between px-4 py-3 border-b border-slate-700">
            <h2 class="text-sm font-semibold text-white">Notifications</h2>
            <button
              type="button"
              data-testid="mark-all-read"
              class="text-xs text-blue-400 hover:text-blue-300 disabled:text-slate-600 disabled:cursor-not-allowed cursor-pointer"
              [disabled]="service.unreadCount() === 0"
              (click)="service.markAllRead()"
            >
              Mark all as read
            </button>
          </div>

          @if (!service.enabled) {
            <p class="px-4 py-8 text-center text-sm text-slate-400" data-testid="notifications-empty">
              Notifications are only available when connected to the live API.
            </p>
          } @else if (service.error(); as error) {
            <p class="px-4 py-3 text-sm text-red-300" role="alert">{{ error }}</p>
          }

          @if (service.enabled) {
            @if (service.loading() && service.items().length === 0) {
              <p class="px-4 py-8 text-center text-sm text-slate-400">Loading…</p>
            } @else if (service.items().length === 0) {
              <p class="px-4 py-8 text-center text-sm text-slate-400" data-testid="notifications-empty">
                You are all caught up.
              </p>
            } @else {
              <ul class="max-h-96 overflow-y-auto divide-y divide-slate-700/60" role="list">
                @for (item of service.items(); track item.id) {
                  <li>
                    <button
                      type="button"
                      data-notification-item
                      data-testid="notification-item"
                      class="w-full text-left px-4 py-3 flex gap-3 items-start hover:bg-slate-700/50 focus:outline-none focus-visible:bg-slate-700/70 cursor-pointer"
                      (click)="openItem(item)"
                    >
                      <span
                        class="mt-1.5 w-2 h-2 rounded-full shrink-0"
                        [class]="item.readAt === null ? 'bg-blue-500' : 'bg-transparent'"
                        aria-hidden="true"
                      ></span>
                      <span class="min-w-0">
                        <span
                          class="block text-sm truncate"
                          [class]="item.readAt === null ? 'text-white font-medium' : 'text-slate-400'"
                          >{{ text(item) }}</span
                        >
                        <span class="block text-xs text-slate-500">
                          {{ ago(item) }}{{ item.readAt === null ? ' · unread' : '' }}
                        </span>
                      </span>
                    </button>
                  </li>
                }
              </ul>
              @if (service.hasMore()) {
                <button
                  type="button"
                  data-testid="notifications-more"
                  class="w-full px-4 py-2 text-xs text-blue-400 hover:text-blue-300 border-t border-slate-700 cursor-pointer"
                  [disabled]="service.loadingMore()"
                  (click)="service.loadMore()"
                >
                  {{ service.loadingMore() ? 'Loading…' : 'Show older' }}
                </button>
              }
            }
          }
        </div>
      }
    </div>
  `,
})
export class NotificationBellComponent {
  readonly service = inject(NotificationsService);
  private readonly router = inject(Router);
  private readonly store = inject(Store);
  private readonly toast = inject(ToastService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly injector = inject(Injector);
  private readonly bell = viewChild.required<ElementRef<HTMLButtonElement>>('bell');
  private readonly leads = this.store.selectSignal(selectLeadEntities);

  readonly open = signal(false);
  readonly label = computed(() => bellLabel(this.service.unreadCount()));
  readonly badge = computed(() => badgeText(this.service.unreadCount()));

  constructor() {
    this.service.start();
    inject(DestroyRef).onDestroy(() => this.service.stop());
  }

  text(item: NotificationDto): string {
    return notificationText(item);
  }

  ago(item: NotificationDto): string {
    return formatAgo(item.createdAt, Date.now());
  }

  toggle(): void {
    if (this.open()) {
      this.close(false);
      return;
    }
    this.open.set(true);
    if (this.service.enabled) this.service.loadList();
    afterNextRender(() => this.focusItem(0), { injector: this.injector });
  }

  close(restoreFocus: boolean): void {
    if (!this.open()) return;
    this.open.set(false);
    if (restoreFocus) this.bell().nativeElement.focus();
  }

  /** Marks the notification read and opens its lead on the leads page. */
  openItem(item: NotificationDto): void {
    if (item.readAt === null) this.service.markRead([item.id]);
    this.close(false);
    if (!this.leads()[item.leadId]) {
      this.toast.show('info', 'Lead not available', 'It is no longer in your list.');
      return;
    }
    this.store.dispatch(LeadsActions.selectLead({ id: item.leadId }));
    void this.router.navigate(['/leads']);
  }

  @HostListener('document:click', ['$event'])
  onDocumentClick(event: Event): void {
    if (this.open() && !this.host.nativeElement.contains(event.target as Node)) this.close(false);
  }

  @HostListener('keydown.escape')
  onEscape(): void {
    this.close(true);
  }

  onPanelKeydown(event: KeyboardEvent): void {
    const items = this.items();
    if (items.length === 0) return;
    const current = items.indexOf(document.activeElement as HTMLElement);
    let next: number | null = null;
    switch (event.key) {
      case 'ArrowDown':
        next = current < 0 ? 0 : Math.min(items.length - 1, current + 1);
        break;
      case 'ArrowUp':
        next = current <= 0 ? 0 : current - 1;
        break;
      case 'Home':
        next = 0;
        break;
      case 'End':
        next = items.length - 1;
        break;
    }
    if (next === null) return;
    event.preventDefault();
    items[next].focus();
  }

  private items(): HTMLElement[] {
    return Array.from(this.host.nativeElement.querySelectorAll<HTMLElement>('[data-notification-item]'));
  }

  private focusItem(index: number): void {
    this.items()[index]?.focus();
  }
}
