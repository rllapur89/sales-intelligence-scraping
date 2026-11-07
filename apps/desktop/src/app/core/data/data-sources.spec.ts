import { TestBed } from '@angular/core/testing';
import { HttpClient, provideHttpClient, withInterceptors } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, firstValueFrom, of } from 'rxjs';
import type { Page } from '@leads/shared';
import { provideDataSources } from './data-sources.provider';
import { LeadsDataSource, LiveLeadsDataSource, MockLeadsDataSource, loadAllLeads } from './leads.data-source';
import { JobsDataSource, LiveJobsDataSource, MockJobsDataSource } from './jobs.data-source';
import {
  LiveSubscriptionsDataSource,
  MockSubscriptionsDataSource,
  SubscriptionsDataSource,
  toSubscriptionBody,
} from './subscriptions.data-source';
import { LiveMetricsDataSource, MetricsDataSource, MockMetricsDataSource } from './metrics.data-source';
import { Lead } from '../models/lead.model';
import { ENVIRONMENT } from '../config/app-environment';
import { environment } from '../../../environments/environment';
import { authInterceptor } from '../auth/auth.interceptor';
import { AuthService } from '../auth/auth.service';
import { makeLead } from '../../../testing/factories';

describe('provideDataSources', () => {
  function resolve(mode: 'mock' | 'live') {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources(mode)],
    });
    return {
      leads: TestBed.inject(LeadsDataSource),
      jobs: TestBed.inject(JobsDataSource),
      subscriptions: TestBed.inject(SubscriptionsDataSource),
      metrics: TestBed.inject(MetricsDataSource),
    };
  }

  it('mock mode provides the mock implementations', () => {
    const s = resolve('mock');
    expect(s.leads).toBeInstanceOf(MockLeadsDataSource);
    expect(s.jobs).toBeInstanceOf(MockJobsDataSource);
    expect(s.subscriptions).toBeInstanceOf(MockSubscriptionsDataSource);
    expect(s.metrics).toBeInstanceOf(MockMetricsDataSource);
  });

  it('live mode provides the REST implementations', () => {
    const s = resolve('live');
    expect(s.leads).toBeInstanceOf(LiveLeadsDataSource);
    expect(s.jobs).toBeInstanceOf(LiveJobsDataSource);
    expect(s.subscriptions).toBeInstanceOf(LiveSubscriptionsDataSource);
    expect(s.metrics).toBeInstanceOf(LiveMetricsDataSource);
  });
});

describe('loadAllLeads (keyset pagination)', () => {
  function pager(pages: Lead[][]) {
    const calls: { cursor: string | null; limit: number }[] = [];
    const fetchPage = (cursor: string | null, limit: number): Observable<Page<Lead>> => {
      calls.push({ cursor, limit });
      const index = cursor ? Number(cursor) : 0;
      return of({ items: pages[index], nextCursor: index + 1 < pages.length ? String(index + 1) : null });
    };
    return { fetchPage, calls };
  }
  const page = (prefix: string, n: number) =>
    Array.from({ length: n }, (_, i) => makeLead({ id: `${prefix}${i}`, seq: i + 1 }));

  it('loops until nextCursor is null and concatenates the pages in order', async () => {
    const { fetchPage, calls } = pager([page('a', 3), page('b', 3), page('c', 1)]);
    const all = await firstValueFrom(loadAllLeads(fetchPage, 3, 1000));
    expect(all.map(l => l.id)).toEqual(['a0', 'a1', 'a2', 'b0', 'b1', 'b2', 'c0']);
    expect(calls.map(c => c.cursor)).toEqual([null, '1', '2']);
  });

  it('stops at the cap and requests no more than the remaining amount', async () => {
    const { fetchPage, calls } = pager([page('a', 3), page('b', 3), page('c', 3)]);
    const all = await firstValueFrom(loadAllLeads(fetchPage, 3, 5));
    expect(all).toHaveLength(6);
    expect(calls.map(c => c.limit)).toEqual([3, 2]);
    expect(calls).toHaveLength(2);
  });

  it('stops on an empty page even when a cursor is returned', async () => {
    const fetchPage = () => of({ items: [] as Lead[], nextCursor: 'x' });
    expect(await firstValueFrom(loadAllLeads(fetchPage, 10, 100))).toEqual([]);
  });
});

describe('toSubscriptionBody', () => {
  it('flattens the filter and rounds minScore', () => {
    expect(
      toSubscriptionBody({
        name: '  EU fintech ',
        active: false,
        filter: { industries: ['Finance'], regions: ['Europe'], signalTypes: ['hiring'], minScore: 59.6 },
      })
    ).toEqual({
      name: 'EU fintech',
      active: false,
      industries: ['Finance'],
      regions: ['Europe'],
      signalTypes: ['hiring'],
      minScore: 60,
    });
  });
});

describe('MockSubscriptionsDataSource', () => {
  const draft = {
    name: 'Hot',
    active: true,
    filter: { industries: [], regions: [], signalTypes: [], minScore: 80 },
  };

  it('starts with an active "All leads" subscription and supports CRUD in memory', async () => {
    const source = new MockSubscriptionsDataSource();
    const initial = await firstValueFrom(source.list());
    expect(initial.map(s => s.name)).toEqual(['All leads']);

    const created = await firstValueFrom(source.create(draft));
    expect((await firstValueFrom(source.list())).length).toBe(2);

    const updated = await firstValueFrom(source.update(created.id, { ...draft, active: false }));
    expect(updated.active).toBe(false);

    await firstValueFrom(source.remove(created.id));
    expect((await firstValueFrom(source.list())).map(s => s.id)).toEqual(['sub-all']);
  });

  it('rejects updates of unknown ids', async () => {
    const source = new MockSubscriptionsDataSource();
    await expect(firstValueFrom(source.update('nope', draft))).rejects.toThrow('not found');
  });
});

describe('authInterceptor', () => {
  let http: HttpClient;
  let controller: HttpTestingController;
  let auth: { ensureToken: ReturnType<typeof vi.fn>; refresh: ReturnType<typeof vi.fn> };

  function setup(dataMode: 'mock' | 'live'): void {
    auth = {
      ensureToken: vi.fn(() => of('old-token')),
      refresh: vi.fn(() => of({ accessToken: 'new-token' })),
    };
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(withInterceptors([authInterceptor])),
        provideHttpClientTesting(),
        { provide: AuthService, useValue: auth },
        { provide: ENVIRONMENT, useValue: { ...environment, dataMode, apiUrl: 'http://api.test/api' } },
      ],
    });
    http = TestBed.inject(HttpClient);
    controller = TestBed.inject(HttpTestingController);
  }

  afterEach(() => controller.verify());

  it('adds the Bearer token to API requests', () => {
    setup('live');
    http.get('http://api.test/api/leads').subscribe();
    const req = controller.expectOne('http://api.test/api/leads');
    expect(req.request.headers.get('Authorization')).toBe('Bearer old-token');
    req.flush({});
  });

  it('retries once with the refreshed token after a 401', () => {
    setup('live');
    let result: unknown;
    http.get('http://api.test/api/leads').subscribe(r => (result = r));
    controller.expectOne('http://api.test/api/leads').flush('expired', { status: 401, statusText: 'Unauthorized' });
    const retry = controller.expectOne('http://api.test/api/leads');
    expect(retry.request.headers.get('Authorization')).toBe('Bearer new-token');
    retry.flush({ ok: true });
    expect(result).toEqual({ ok: true });
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('does not retry a second 401', () => {
    setup('live');
    let error: unknown;
    http.get('http://api.test/api/leads').subscribe({ error: e => (error = e) });
    controller.expectOne('http://api.test/api/leads').flush('x', { status: 401, statusText: 'Unauthorized' });
    controller.expectOne('http://api.test/api/leads').flush('x', { status: 401, statusText: 'Unauthorized' });
    expect(error).toBeDefined();
    expect(auth.refresh).toHaveBeenCalledTimes(1);
  });

  it('leaves other origins and mock mode untouched', () => {
    setup('live');
    http.get('http://other.test/x').subscribe();
    expect(controller.expectOne('http://other.test/x').request.headers.has('Authorization')).toBe(false);
  });

  it('adds nothing in mock mode', () => {
    setup('mock');
    http.get('http://api.test/api/leads').subscribe();
    expect(controller.expectOne('http://api.test/api/leads').request.headers.has('Authorization')).toBe(false);
  });
});

describe('leads data source signals (detail panel)', () => {
  it('mock mode has no stored signals', async () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources('mock')],
    });
    const source = TestBed.inject(LeadsDataSource);
    expect(await firstValueFrom(source.loadSignals(makeLead()))).toEqual([]);
  });

  it('live mode reads the signals of GET /api/leads/:id', async () => {
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        { provide: ENVIRONMENT, useValue: { ...environment, dataMode: 'live', apiUrl: 'http://api.test/api' } },
        ...provideDataSources('live'),
      ],
    });
    const controller = TestBed.inject(HttpTestingController);
    const result = firstValueFrom(TestBed.inject(LeadsDataSource).loadSignals(makeLead({ id: 'l 1' })));
    const signals = [
      {
        id: 's1',
        companyId: 'c1',
        type: 'hiring',
        source: 'remoteok',
        payload: { title: 'Engineer' },
        detectedAt: '2026-06-01T00:00:00.000Z',
        scrapedAt: '2026-06-01T00:00:00.000Z',
      },
    ];
    controller.expectOne('http://api.test/api/leads/l%201').flush({ ...makeLead({ id: 'l 1' }), signals });
    expect(await result).toEqual(signals);
    controller.verify();
  });
});
