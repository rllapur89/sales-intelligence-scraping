import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import type { FunnelDto, ScoreTrendDto } from '@leads/shared';
import { ReportsComponent } from './reports.component';
import {
  AnalyticsDataSource,
  MockAnalyticsDataSource,
} from '../../core/data/analytics.data-source';
import { MockDataService } from '../../core/services/mock-data.service';
import { makeLead } from '../../../testing/factories';

const funnel: FunnelDto = {
  stages: [
    { stage: 'new', count: 10, conversionFromPrevious: 100 },
    { stage: 'contacted', count: 5, conversionFromPrevious: 50 },
  ],
};

function trend(days: number): ScoreTrendDto {
  return {
    days,
    points: Array.from({ length: days }, (_, i) => ({
      date: `2025-03-${String(i + 1).padStart(2, '0')}`,
      newLeads: i === 0 ? 2 : 0,
      avgScore: i === 0 ? 70 : 0,
    })),
  };
}

function fakeSource(overrides: Partial<Record<keyof AnalyticsDataSource, unknown>> = {}) {
  return {
    funnel: vi.fn(() => of(funnel)),
    bySource: vi.fn(() =>
      of({ items: [{ key: 'github', label: 'GitHub', count: 3, avgScore: 71.5 }] }),
    ),
    byIndustry: vi.fn(() =>
      of({ items: [{ key: 'Tech', label: 'Tech', count: 4, avgScore: 60 }] }),
    ),
    signals: vi.fn(() => of({ items: [{ type: 'hiring', count: 7 }] })),
    scoreTrend: vi.fn((days: number) => of(trend(days))),
    ...overrides,
  };
}

function create(source: ReturnType<typeof fakeSource>) {
  TestBed.configureTestingModule({
    imports: [ReportsComponent],
    providers: [{ provide: AnalyticsDataSource, useValue: source }],
  });
  const fixture = TestBed.createComponent(ReportsComponent);
  return { fixture, cmp: fixture.componentInstance, el: fixture.nativeElement as HTMLElement };
}

describe('ReportsComponent', () => {
  it('loads every report once with the default 30-day range and renders the charts', async () => {
    const source = fakeSource();
    const { fixture, el, cmp } = create(source);
    await fixture.whenStable();
    expect(source.funnel).toHaveBeenCalledTimes(1);
    expect(source.scoreTrend).toHaveBeenCalledWith(30);
    expect(cmp.days()).toBe(30);
    expect(el.querySelectorAll('app-report-card')).toHaveLength(5);
    expect(el.querySelector('app-funnel-chart')).not.toBeNull();
    expect(el.querySelectorAll('app-horizontal-bar-chart')).toHaveLength(2);
    expect(el.querySelector('app-line-chart')).not.toBeNull();
    expect(el.textContent).toContain('GitHub');
    expect(el.querySelectorAll('[role="alert"]')).toHaveLength(0);
  });

  it('shows the loading state until the data arrives', async () => {
    const pending = new Subject<FunnelDto>();
    const { fixture, cmp, el } = create(fakeSource({ funnel: vi.fn(() => pending) }));
    await fixture.whenStable();
    expect(cmp.funnel().status).toBe('loading');
    expect(el.querySelectorAll('[role="status"]')).toHaveLength(1);
    pending.next(funnel);
    await fixture.whenStable();
    expect(cmp.funnel().status).toBe('ready');
    expect(el.querySelectorAll('[role="status"]')).toHaveLength(0);
  });

  it('isolates a failing report: the others stay usable and retry reloads it', async () => {
    let fail = true;
    const source = fakeSource({
      signals: vi.fn(() =>
        fail ? throwError(() => ({ status: 500 })) : of({ items: [{ type: 'hiring', count: 1 }] }),
      ),
    });
    const { fixture, cmp, el } = create(source);
    await fixture.whenStable();
    const alert = el.querySelector('[role="alert"]');
    expect(alert?.textContent).toContain('The server returned an error (500).');
    expect(cmp.funnel().status).toBe('ready');

    fail = false;
    cmp.retry('signals');
    await fixture.whenStable();
    expect(el.querySelector('[role="alert"]')).toBeNull();
    expect(source.signals).toHaveBeenCalledTimes(2);
    expect(source.funnel).toHaveBeenCalledTimes(1);
  });

  it('shows the empty state for reports without data', async () => {
    const { fixture, cmp, el } = create(
      fakeSource({
        byIndustry: vi.fn(() => of({ items: [] })),
        signals: vi.fn(() => of({ items: [{ type: 'hiring', count: 0 }] })),
      }),
    );
    await fixture.whenStable();
    expect(cmp.byIndustryEmpty()).toBe(true);
    expect(cmp.signalsEmpty()).toBe(true);
    expect(cmp.funnelEmpty()).toBe(false);
    expect(el.textContent).toContain('No data yet');
  });

  it('changing the range reloads only the score trend; selecting the same range does nothing', async () => {
    const source = fakeSource();
    const { fixture, cmp, el } = create(source);
    await fixture.whenStable();
    cmp.setDays(30);
    expect(source.scoreTrend).toHaveBeenCalledTimes(1);
    cmp.setDays(7);
    await fixture.whenStable();
    expect(source.scoreTrend).toHaveBeenLastCalledWith(7);
    expect(source.funnel).toHaveBeenCalledTimes(1);
    const pressed = Array.from(el.querySelectorAll('button[aria-pressed="true"]')).map((b) =>
      b.textContent?.trim(),
    );
    expect(pressed).toEqual(['7 days']);
    expect(el.textContent).toContain('last 7 days');
  });

  it('a stale response of a previous range cannot overwrite the new one', async () => {
    const first = new Subject<ScoreTrendDto>();
    const second = new Subject<ScoreTrendDto>();
    const queue = [first, second];
    const source = fakeSource({ scoreTrend: vi.fn(() => queue.shift()!) });
    const { fixture, cmp } = create(source);
    await fixture.whenStable();
    cmp.setDays(90);
    first.next(trend(30));
    second.next(trend(90));
    await fixture.whenStable();
    const state = cmp.trend();
    expect(state.status === 'ready' && state.data.days).toBe(90);
  });

  describe('export', () => {
    const now = new Date('2025-03-10T12:00:00.000Z');

    it('saves the shown report as CSV with the export helper', async () => {
      const { fixture, cmp } = create(fakeSource());
      await fixture.whenStable();
      const save = vi.spyOn(cmp, 'save').mockImplementation(() => undefined);
      cmp.export('by-source', 'csv', now);
      expect(save).toHaveBeenCalledWith(
        'salesintel-by-source-2025-03-10.csv',
        'Source,Leads,Average score\nGitHub,3,71.5',
        'csv',
      );
    });

    it('saves JSON with the range for the score trend only', async () => {
      const { fixture, cmp } = create(fakeSource());
      await fixture.whenStable();
      const save = vi.spyOn(cmp, 'save').mockImplementation(() => undefined);
      cmp.export('score-trend', 'json', now);
      cmp.export('funnel', 'json', now);
      const [trendCall, funnelCall] = save.mock.calls;
      expect(JSON.parse(trendCall[1]).days).toBe(30);
      expect(trendCall[0]).toBe('salesintel-score-trend-2025-03-10.json');
      expect(JSON.parse(funnelCall[1]).days).toBeUndefined();
    });

    it('exports nothing while loading, after an error or for an empty report', async () => {
      const { fixture, cmp } = create(
        fakeSource({
          funnel: vi.fn(() => new Subject()),
          signals: vi.fn(() => throwError(() => ({ status: 0 }))),
          byIndustry: vi.fn(() => of({ items: [] })),
        }),
      );
      await fixture.whenStable();
      const save = vi.spyOn(cmp, 'save').mockImplementation(() => undefined);
      cmp.export('funnel', 'csv');
      cmp.export('signals', 'csv');
      cmp.export('by-industry', 'json');
      expect(save).not.toHaveBeenCalled();
    });
  });
});

describe('ReportsComponent in mock mode', () => {
  it('renders from the mock leads without any backend', async () => {
    TestBed.configureTestingModule({
      imports: [ReportsComponent],
      providers: [
        { provide: AnalyticsDataSource, useClass: MockAnalyticsDataSource },
        {
          provide: MockDataService,
          useValue: {
            getLeads: () => [
              makeLead({
                id: 'a',
                stage: 'won',
                signalTypes: ['hiring'],
                updatedAt: new Date().toISOString(),
              }),
              makeLead({
                id: 'b',
                stage: 'new',
                signalTypes: ['funding'],
                updatedAt: new Date().toISOString(),
              }),
            ],
          },
        },
      ],
    });
    const fixture = TestBed.createComponent(ReportsComponent);
    await fixture.whenStable();
    const cmp = fixture.componentInstance;
    expect(cmp.funnel().status).toBe('ready');
    expect(cmp.funnelSteps().map((s) => s.count)).toEqual([2, 1, 1, 1, 1]);
    expect(cmp.trendEmpty()).toBe(false);
    expect((fixture.nativeElement as HTMLElement).querySelectorAll('[role="alert"]')).toHaveLength(
      0,
    );
  });
});
