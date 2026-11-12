import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { Observable, firstValueFrom } from 'rxjs';
import {
  AnalyticsDataSource,
  LiveAnalyticsDataSource,
  MockAnalyticsDataSource,
} from '../data/analytics.data-source';
import { provideDataSources } from '../data/data-sources.provider';
import { MockDataService } from '../services/mock-data.service';
import { ENVIRONMENT } from '../config/app-environment';
import { environment } from '../../../environments/environment';
import { makeLead } from '../../../testing/factories';

describe('AnalyticsDataSource', () => {
  it('provideDataSources picks the mock or the live implementation', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources('mock')],
    });
    expect(TestBed.inject(AnalyticsDataSource)).toBeInstanceOf(MockAnalyticsDataSource);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources('live')],
    });
    expect(TestBed.inject(AnalyticsDataSource)).toBeInstanceOf(LiveAnalyticsDataSource);
  });

  describe('mock', () => {
    const leads = [
      makeLead({
        id: 'a',
        stage: 'new',
        score: 60,
        signalTypes: ['hiring'],
        company: { industry: 'Tech' },
      }),
      makeLead({
        id: 'b',
        stage: 'won',
        score: 80,
        signalTypes: ['funding'],
        company: { industry: 'Tech' },
      }),
    ];
    let source: MockAnalyticsDataSource;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          MockAnalyticsDataSource,
          { provide: MockDataService, useValue: { getLeads: () => leads } },
        ],
      });
      source = TestBed.inject(MockAnalyticsDataSource);
    });

    it('computes every report from the mock leads without HTTP', async () => {
      expect((await firstValueFrom(source.funnel())).stages.map((s) => s.count)).toEqual([
        2, 1, 1, 1, 1,
      ]);
      expect((await firstValueFrom(source.byIndustry())).items).toEqual([
        { key: 'Tech', label: 'Tech', count: 2, avgScore: 70 },
      ]);
      expect((await firstValueFrom(source.bySource())).items.map((i) => i.key)).toEqual([
        'greenhouse',
        'hn-hiring',
      ]);
      expect((await firstValueFrom(source.signals())).items[0].count).toBe(1);
    });

    it('returns a score trend with exactly the requested number of days', async () => {
      expect((await firstValueFrom(source.scoreTrend(7))).points).toHaveLength(7);
      expect((await firstValueFrom(source.scoreTrend(90))).days).toBe(90);
    });
  });

  describe('live', () => {
    let source: LiveAnalyticsDataSource;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ENVIRONMENT,
            useValue: { ...environment, dataMode: 'live', apiUrl: 'http://api.test/api' },
          },
          LiveAnalyticsDataSource,
        ],
      });
      source = TestBed.inject(LiveAnalyticsDataSource);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it.each([
      ['funnel', 'funnel'],
      ['bySource', 'by-source'],
      ['byIndustry', 'by-industry'],
      ['signals', 'signals'],
    ] as const)('%s calls GET /analytics/%s', (method, path) => {
      let result: unknown;
      (source[method]() as Observable<unknown>).subscribe((r) => (result = r));
      const req = http.expectOne(`http://api.test/api/analytics/${path}`);
      expect(req.request.method).toBe('GET');
      req.flush({ marker: path });
      expect(result).toEqual({ marker: path });
    });

    it('scoreTrend sends the days query parameter', () => {
      source.scoreTrend(30).subscribe();
      const req = http.expectOne((r) => r.url === 'http://api.test/api/analytics/score-trend');
      expect(req.request.params.get('days')).toBe('30');
      req.flush({ days: 30, points: [] });
    });

    it('propagates HTTP errors to the subscriber', () => {
      let status = 0;
      source.funnel().subscribe({ error: (e) => (status = e.status) });
      http
        .expectOne('http://api.test/api/analytics/funnel')
        .flush('x', { status: 500, statusText: 'Server Error' });
      expect(status).toBe(500);
    });
  });
});
