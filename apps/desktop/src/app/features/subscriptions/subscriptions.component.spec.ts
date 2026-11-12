import { TestBed } from '@angular/core/testing';
import { firstValueFrom } from 'rxjs';
import { SubscriptionsComponent, addChip, emptyDraft } from './subscriptions.component';
import { SubscriptionsService } from '../../core/services/subscriptions.service';
import {
  MockSubscriptionsDataSource,
  SubscriptionsDataSource,
  toSubscriptionBody,
} from '../../core/data/subscriptions.data-source';
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

describe('subscription notify flag', () => {
  const filter = { industries: [], regions: [], signalTypes: [], minScore: 0 };

  it('new drafts start with notify off', () => {
    expect(emptyDraft().notify).toBe(false);
  });

  it('toSubscriptionBody sends notify only when the draft sets it', () => {
    expect(toSubscriptionBody({ name: 'A', active: true, notify: true, filter })).toMatchObject({ notify: true });
    expect(toSubscriptionBody({ name: 'A', active: true, notify: false, filter })).toMatchObject({ notify: false });
    expect('notify' in toSubscriptionBody({ name: 'A', active: true, filter })).toBe(false);
  });

  it('the mock source stores notify and keeps it when a draft does not say', async () => {
    const source = new MockSubscriptionsDataSource();
    expect((await firstValueFrom(source.list()))[0].notify).toBe(false);
    const created = await firstValueFrom(source.create({ name: 'Hot', active: true, notify: true, filter }));
    expect(created.notify).toBe(true);
    const paused = await firstValueFrom(source.update(created.id, { name: 'Hot', active: false, filter }));
    expect(paused.notify).toBe(true);
    const off = await firstValueFrom(source.update(created.id, { name: 'Hot', active: false, notify: false, filter }));
    expect(off.notify).toBe(false);
  });

  it('pausing through the service keeps notify on', () => {
    TestBed.configureTestingModule({
      providers: [{ provide: SubscriptionsDataSource, useClass: MockSubscriptionsDataSource }],
    });
    const service = TestBed.inject(SubscriptionsService);
    service.load();
    service.save(null, { ...emptyDraft(), name: 'Alerts', notify: true });
    const created = service.items()[1];
    expect(created.notify).toBe(true);
    service.toggleActive(created);
    expect(service.items()[1].active).toBe(false);
    expect(service.items()[1].notify).toBe(true);
  });

  it('the editor toggles notify and loads it back when editing', async () => {
    TestBed.configureTestingModule({
      imports: [SubscriptionsComponent],
      providers: [{ provide: SubscriptionsDataSource, useClass: MockSubscriptionsDataSource }],
    });
    const fixture = TestBed.createComponent(SubscriptionsComponent);
    const cmp = fixture.componentInstance;
    await fixture.whenStable();

    cmp.startCreate();
    fixture.detectChanges();
    const box = (): HTMLInputElement =>
      fixture.nativeElement.querySelector('[data-testid="sub-notify"]') as HTMLInputElement;
    expect(box().checked).toBe(false);
    box().click();
    expect(cmp.draft()?.notify).toBe(true);
    cmp.patch({ name: 'Hot' });
    cmp.save();
    await fixture.whenStable();
    fixture.detectChanges();

    const saved = cmp.service.items().find(i => i.name === 'Hot')!;
    expect(saved.notify).toBe(true);
    expect(fixture.nativeElement.querySelectorAll('[data-testid="notify-badge"]')).toHaveLength(1);

    cmp.startEdit(saved);
    expect(cmp.draft()?.notify).toBe(true);
  });
});
