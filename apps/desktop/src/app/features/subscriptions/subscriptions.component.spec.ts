import { TestBed } from '@angular/core/testing';
import { SubscriptionsComponent, addChip, emptyDraft } from './subscriptions.component';
import { SubscriptionsService } from '../../core/services/subscriptions.service';
import { MockSubscriptionsDataSource, SubscriptionsDataSource } from '../../core/data/subscriptions.data-source';
import { ToastService } from '../../shared/services/toast.service';

describe('addChip', () => {
  it('trims, ignores blanks and case-insensitive duplicates', () => {
    expect(addChip([], '  Tech ')).toEqual(['Tech']);
    expect(addChip(['Tech'], 'tech')).toEqual(['Tech']);
    expect(addChip(['Tech'], '   ')).toEqual(['Tech']);
    expect(addChip(['Tech'], 'Finance')).toEqual(['Tech', 'Finance']);
  });
});

describe('SubscriptionsService (mock data source)', () => {
  let service: SubscriptionsService;
  let toast: ToastService;

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [{ provide: SubscriptionsDataSource, useClass: MockSubscriptionsDataSource }],
    });
    service = TestBed.inject(SubscriptionsService);
    toast = TestBed.inject(ToastService);
  });

  it('loads, creates (toast), toggles and deletes', () => {
    service.load();
    expect(service.items().map(s => s.name)).toEqual(['All leads']);

    let done = false;
    service.save(null, { ...emptyDraft(), name: 'Fintech EU' }, () => (done = true));
    expect(done).toBe(true);
    expect(service.items()).toHaveLength(2);
    expect(toast.toasts().at(-1)?.title).toBe('Subscription created');

    const created = service.items()[1];
    service.toggleActive(created);
    expect(service.items()[1].active).toBe(false);
    expect(toast.toasts().at(-1)?.title).toBe('Subscription updated');

    service.remove(created);
    expect(service.items()).toHaveLength(1);
    expect(toast.toasts().at(-1)?.title).toBe('Subscription deleted');
  });
});

describe('SubscriptionsComponent', () => {
  it('opens an empty form and edits chips and signal types', async () => {
    TestBed.configureTestingModule({
      imports: [SubscriptionsComponent],
      providers: [{ provide: SubscriptionsDataSource, useClass: MockSubscriptionsDataSource }],
    });
    const fixture = TestBed.createComponent(SubscriptionsComponent);
    const cmp = fixture.componentInstance;
    await fixture.whenStable();
    expect(cmp.service.items()).toHaveLength(1);

    cmp.startCreate();
    cmp.industryInput.set('Tech');
    cmp.commitChip('industries');
    cmp.toggleSignalType('hiring');
    cmp.patchFilter({ minScore: 70 });
    expect(cmp.draft()?.filter).toEqual({
      industries: ['Tech'],
      regions: [],
      signalTypes: ['hiring'],
      minScore: 70,
    });

    cmp.removeChip('industries', 'Tech');
    cmp.toggleSignalType('hiring');
    expect(cmp.draft()?.filter.industries).toEqual([]);
    expect(cmp.draft()?.filter.signalTypes).toEqual([]);
  });
});
