import { Injectable, inject, signal } from '@angular/core';
import { Observable } from 'rxjs';
import type { SubscriptionDto } from '@leads/shared';
import { SubscriptionDraft, SubscriptionsDataSource } from '../data/subscriptions.data-source';
import { errorMessage } from '../util/errors';
import { ToastService } from '../../shared/services/toast.service';

export function draftOf(sub: SubscriptionDto): SubscriptionDraft {
  return {
    name: sub.name,
    active: sub.active,
    filter: {
      industries: [...sub.filter.industries],
      regions: [...sub.filter.regions],
      signalTypes: [...sub.filter.signalTypes],
      minScore: sub.filter.minScore,
    },
  };
}

/** The user's live-feed subscriptions (REST in live mode, in memory in mock mode). */
@Injectable({ providedIn: 'root' })
export class SubscriptionsService {
  private readonly source = inject(SubscriptionsDataSource);
  private readonly toast = inject(ToastService);

  readonly items = signal<SubscriptionDto[]>([]);
  readonly loading = signal(false);
  readonly saving = signal(false);
  readonly error = signal<string | null>(null);

  load(): void {
    this.loading.set(true);
    this.error.set(null);
    this.source.list().subscribe({
      next: items => {
        this.items.set(items);
        this.loading.set(false);
      },
      error: err => {
        this.error.set(errorMessage(err, 'Could not load subscriptions'));
        this.loading.set(false);
      },
    });
  }

  /** Creates (no id) or updates a subscription; resolves with a toast. `done` runs on success. */
  save(id: string | null, draft: SubscriptionDraft, done?: () => void): void {
    this.saving.set(true);
    const request: Observable<SubscriptionDto> = id
      ? this.source.update(id, draft)
      : this.source.create(draft);
    request.subscribe({
      next: saved => {
        this.items.update(list =>
          id ? list.map(s => (s.id === saved.id ? saved : s)) : [...list, saved]
        );
        this.saving.set(false);
        this.toast.show('success', id ? 'Subscription updated' : 'Subscription created', saved.name);
        done?.();
      },
      error: err => {
        this.saving.set(false);
        this.toast.show('error', 'Could not save the subscription', errorMessage(err, 'Request failed'));
      },
    });
  }

  toggleActive(sub: SubscriptionDto): void {
    this.save(sub.id, { ...draftOf(sub), active: !sub.active });
  }

  remove(sub: SubscriptionDto): void {
    this.source.remove(sub.id).subscribe({
      next: () => {
        this.items.update(list => list.filter(s => s.id !== sub.id));
        this.toast.show('success', 'Subscription deleted', sub.name);
      },
      error: err =>
        this.toast.show('error', 'Could not delete the subscription', errorMessage(err, 'Request failed')),
    });
  }
}

