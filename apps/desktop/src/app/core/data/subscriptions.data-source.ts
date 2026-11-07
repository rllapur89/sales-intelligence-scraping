import { Injectable, inject } from '@angular/core';
import { Observable, of, throwError } from 'rxjs';
import type { SubscriptionDto, SubscriptionFilter } from '@leads/shared';
import { ApiService, SubscriptionBody } from '../services/api.service';

/** What the subscription form edits. */
export interface SubscriptionDraft {
  name: string;
  active: boolean;
  filter: SubscriptionFilter;
}

/** Flat body expected by the API DTOs. Pure. */
export function toSubscriptionBody(draft: SubscriptionDraft): SubscriptionBody {
  return {
    name: draft.name.trim(),
    active: draft.active,
    industries: draft.filter.industries,
    regions: draft.filter.regions,
    signalTypes: draft.filter.signalTypes,
    minScore: Math.round(draft.filter.minScore),
  };
}

export abstract class SubscriptionsDataSource {
  abstract list(): Observable<SubscriptionDto[]>;
  abstract create(draft: SubscriptionDraft): Observable<SubscriptionDto>;
  abstract update(id: string, draft: SubscriptionDraft): Observable<SubscriptionDto>;
  abstract remove(id: string): Observable<void>;
}

/** In-memory subscriptions for mock mode. */
@Injectable()
export class MockSubscriptionsDataSource extends SubscriptionsDataSource {
  private items: SubscriptionDto[] = [
    {
      id: 'sub-all',
      name: 'All leads',
      active: true,
      filter: { industries: [], regions: [], signalTypes: [], minScore: 0 },
    },
  ];
  private nextId = 1;

  list(): Observable<SubscriptionDto[]> {
    return of([...this.items]);
  }

  create(draft: SubscriptionDraft): Observable<SubscriptionDto> {
    const created: SubscriptionDto = { id: `sub-${this.nextId++}`, ...this.normalize(draft) };
    this.items = [...this.items, created];
    return of(created);
  }

  update(id: string, draft: SubscriptionDraft): Observable<SubscriptionDto> {
    const current = this.items.find(s => s.id === id);
    if (!current) return throwError(() => new Error('Subscription not found'));
    const updated: SubscriptionDto = { id, ...this.normalize(draft) };
    this.items = this.items.map(s => (s.id === id ? updated : s));
    return of(updated);
  }

  remove(id: string): Observable<void> {
    this.items = this.items.filter(s => s.id !== id);
    return of(undefined);
  }

  private normalize(draft: SubscriptionDraft): Omit<SubscriptionDto, 'id'> {
    return {
      name: draft.name.trim(),
      active: draft.active,
      filter: { ...draft.filter, minScore: Math.round(draft.filter.minScore) },
    };
  }
}

@Injectable()
export class LiveSubscriptionsDataSource extends SubscriptionsDataSource {
  private readonly api = inject(ApiService);

  list(): Observable<SubscriptionDto[]> {
    return this.api.getSubscriptions();
  }

  create(draft: SubscriptionDraft): Observable<SubscriptionDto> {
    return this.api.createSubscription(toSubscriptionBody(draft));
  }

  update(id: string, draft: SubscriptionDraft): Observable<SubscriptionDto> {
    return this.api.updateSubscription(id, toSubscriptionBody(draft));
  }

  remove(id: string): Observable<void> {
    return this.api.deleteSubscription(id);
  }
}
