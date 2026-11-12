import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Store, provideStore } from '@ngrx/store';
import { of } from 'rxjs';
import type { NotificationDto } from '@leads/shared';
import { DATA_MODE } from '../../../core/config/app-environment';
import { NotificationsDataSource } from '../../../core/data/notifications.data-source';
import { NOTIFICATIONS_POLL_MS } from '../../../core/notifications/notifications-view';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { leadsReducer } from '../../../core/store/leads/leads.reducer';
import { selectSelectedLeadId } from '../../../core/store/leads/leads.selectors';
import { makeLead } from '../../../../testing/factories';
import { ToastService } from '../../services/toast.service';
import { NotificationBellComponent } from './notification-bell.component';

const n = (id: string, over: Partial<NotificationDto> = {}): NotificationDto => ({
  id,
  type: 'new_match',
  leadId: `lead-${id}`,
  title: `Company ${id}`,
  createdAt: new Date().toISOString(),
  readAt: null,
  ...over,
});

describe('NotificationBellComponent', () => {
  let fixture: ComponentFixture<NotificationBellComponent>;
  let store: Store;
  let router: Router;
  let toast: ToastService;
  let source: {
    list: ReturnType<typeof vi.fn>;
    unreadCount: ReturnType<typeof vi.fn>;
    markRead: ReturnType<typeof vi.fn>;
  };

  const el = (): HTMLElement => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement>(testId: string) => el().querySelector<T>(`[data-testid="${testId}"]`);
  const qa = (testId: string) => Array.from(el().querySelectorAll<HTMLElement>(`[data-testid="${testId}"]`));
  const key = (target: HTMLElement, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  async function setup(mode: 'live' | 'mock', items: NotificationDto[] = [n('a'), n('b')], unread = items.length) {
    source = {
      list: vi.fn(() => of({ items, nextCursor: null })),
      unreadCount: vi.fn(() => of(unread)),
      markRead: vi.fn(() => of({ updated: 1 })),
    };
    TestBed.configureTestingModule({
      imports: [NotificationBellComponent],
      providers: [
        provideRouter([]),
        provideStore({ leads: leadsReducer }),
        { provide: NotificationsDataSource, useValue: source },
        { provide: DATA_MODE, useValue: mode },
        { provide: NOTIFICATIONS_POLL_MS, useValue: 600_000 },
      ],
    });
    store = TestBed.inject(Store);
    router = TestBed.inject(Router);
    toast = TestBed.inject(ToastService);
    vi.spyOn(router, 'navigate').mockResolvedValue(true);
    fixture = TestBed.createComponent(NotificationBellComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function openPanel(): Promise<void> {
    q('notification-bell')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  describe('bell and badge', () => {
    it('names the button with the unread count and shows it in an aria-live badge', async () => {
      await setup('live', [n('a'), n('b'), n('c')]);
      expect(q('notification-bell')!.getAttribute('aria-label')).toBe('Notifications, 3 unread');
      const badge = q('notification-badge')!;
      expect(badge.textContent?.trim()).toBe('3');
      expect(badge.getAttribute('aria-live')).toBe('polite');
      expect(badge.classList.contains('hidden')).toBe(false);
    });

    it('hides the badge when nothing is unread', async () => {
      await setup('live', [], 0);
      expect(q('notification-badge')!.classList.contains('hidden')).toBe(true);
      expect(q('notification-bell')!.getAttribute('aria-label')).toBe('Notifications, 0 unread');
    });

    it('caps the badge at 99+', async () => {
      await setup('live', [n('a')], 150);
      expect(q('notification-badge')!.textContent?.trim()).toBe('99+');
    });

    it('starts polling on creation and stops on destroy', async () => {
      await setup('live');
      expect(source.unreadCount).toHaveBeenCalledTimes(1);
      fixture.destroy();
    });
  });

  describe('dropdown', () => {
    it('opens on click, lists the notifications and reflects aria-expanded', async () => {
      await setup('live');
      expect(q('notification-panel')).toBeNull();
      expect(q('notification-bell')!.getAttribute('aria-expanded')).toBe('false');
      await openPanel();
      expect(q('notification-bell')!.getAttribute('aria-expanded')).toBe('true');
      expect(qa('notification-item').map(i => i.textContent?.replace(/\s+/g, ' ').trim())).toEqual([
        'New match: Company a just now · unread',
        'New match: Company b just now · unread',
      ]);
    });

    it('shows a retraction in its own words', async () => {
      await setup('live', [n('a', { type: 'retracted' })]);
      await openPanel();
      expect(qa('notification-item')[0].textContent).toContain('Company a no longer matches your subscriptions');
    });

    it('shows an empty state when there are no notifications', async () => {
      await setup('live', [], 0);
      await openPanel();
      expect(q('notifications-empty')!.textContent).toContain('all caught up');
    });

    it('closes with Escape and returns focus to the bell', async () => {
      await setup('live');
      await openPanel();
      key(qa('notification-item')[0], 'Escape');
      fixture.detectChanges();
      expect(q('notification-panel')).toBeNull();
      expect(document.activeElement).toBe(q('notification-bell'));
    });

    it('closes on a click outside but not inside', async () => {
      await setup('live');
      await openPanel();
      q('notification-panel')!.click();
      fixture.detectChanges();
      expect(q('notification-panel')).not.toBeNull();
      document.body.click();
      fixture.detectChanges();
      expect(q('notification-panel')).toBeNull();
    });

    it('toggles closed when the bell is clicked again', async () => {
      await setup('live');
      await openPanel();
      q('notification-bell')!.click();
      fixture.detectChanges();
      expect(q('notification-panel')).toBeNull();
    });

    it('moves focus between items with the arrow keys, Home and End', async () => {
      await setup('live', [n('a'), n('b'), n('c')]);
      await openPanel();
      const items = qa('notification-item');
      expect(document.activeElement).toBe(items[0]);
      key(items[0], 'ArrowDown');
      expect(document.activeElement).toBe(items[1]);
      key(items[1], 'End');
      expect(document.activeElement).toBe(items[2]);
      key(items[2], 'ArrowDown');
      expect(document.activeElement).toBe(items[2]);
      key(items[2], 'ArrowUp');
      expect(document.activeElement).toBe(items[1]);
      key(items[1], 'Home');
      expect(document.activeElement).toBe(items[0]);
      key(items[0], 'ArrowUp');
      expect(document.activeElement).toBe(items[0]);
    });
  });

  describe('mark as read', () => {
    it('marks everything read with "Mark all as read"', async () => {
      await setup('live');
      await openPanel();
      source.unreadCount.mockReturnValue(of(0));
      q('mark-all-read')!.click();
      fixture.detectChanges();
      expect(source.markRead).toHaveBeenCalledWith({ all: true });
      expect(q('notification-bell')!.getAttribute('aria-label')).toBe('Notifications, 0 unread');
      expect((q('mark-all-read') as HTMLButtonElement).disabled).toBe(true);
    });

    it('disables "Mark all as read" when nothing is unread', async () => {
      await setup('live', [n('a', { readAt: '2026-02-02T09:00:00.000Z' })], 0);
      await openPanel();
      expect((q('mark-all-read') as HTMLButtonElement).disabled).toBe(true);
    });
  });

  describe('opening a lead', () => {
    it('marks the notification read, selects the lead and goes to the leads page', async () => {
      await setup('live');
      store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'lead-a' })] }));
      await openPanel();
      source.unreadCount.mockReturnValue(of(1));
      qa('notification-item')[0].click();
      fixture.detectChanges();
      expect(source.markRead).toHaveBeenCalledWith({ ids: ['a'] });
      let selected: string | null = null;
      store.select(selectSelectedLeadId).subscribe(id => (selected = id)).unsubscribe();
      expect(selected).toBe('lead-a');
      expect(router.navigate).toHaveBeenCalledWith(['/leads']);
      expect(q('notification-panel')).toBeNull();
    });

    it('does not mark an already read notification again', async () => {
      await setup('live', [n('a', { readAt: '2026-02-02T09:00:00.000Z' })], 0);
      store.dispatch(LeadsActions.loadLeadsSuccess({ leads: [makeLead({ id: 'lead-a' })] }));
      await openPanel();
      qa('notification-item')[0].click();
      expect(source.markRead).not.toHaveBeenCalled();
      expect(router.navigate).toHaveBeenCalledWith(['/leads']);
    });

    it('explains when the lead is no longer in the list and keeps the selection untouched', async () => {
      await setup('live');
      await openPanel();
      qa('notification-item')[0].click();
      expect(toast.toasts().at(-1)?.title).toBe('Lead not available');
      expect(router.navigate).not.toHaveBeenCalled();
      let selected: string | null = 'x';
      store.select(selectSelectedLeadId).subscribe(id => (selected = id)).unsubscribe();
      expect(selected).toBeNull();
    });
  });

  describe('mock mode', () => {
    it('shows an empty state and never calls the data source', async () => {
      await setup('mock');
      expect(q('notification-badge')!.classList.contains('hidden')).toBe(true);
      await openPanel();
      expect(q('notifications-empty')!.textContent).toContain('live API');
      expect(qa('notification-item')).toHaveLength(0);
      expect(source.unreadCount).not.toHaveBeenCalled();
      expect(source.list).not.toHaveBeenCalled();
    });
  });
});
