import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  WritableSignal,
  computed,
  inject,
  signal,
} from '@angular/core';
import { Observable, Subscription } from 'rxjs';
import type { BreakdownDto, FunnelDto, ScoreTrendDto, SignalMixDto } from '@leads/shared';
import { AnalyticsDataSource } from '../../core/data/analytics.data-source';
import {
  ReportId,
  ReportTable,
  breakdownTable,
  funnelTable,
  scoreTrendTable,
  signalsTable,
} from '../../core/analytics/report-tables';
import {
  ExportFormat,
  downloadText,
  exportFilename,
  reportToCsv,
  reportToJson,
} from '../../core/util/export';
import { BarChartComponent } from '../../shared/components/charts/bar-chart.component';
import { FunnelChartComponent } from '../../shared/components/charts/funnel-chart.component';
import { HorizontalBarChartComponent } from '../../shared/components/charts/horizontal-bar-chart.component';
import { LineChartComponent } from '../../shared/components/charts/line-chart.component';
import { ReportCardComponent } from './report-card.component';
import {
  DEFAULT_RANGE,
  LOADING,
  RANGE_OPTIONS,
  RangeDays,
  ReportState,
  describeError,
  isBreakdownEmpty,
  isFunnelEmpty,
  isSignalMixEmpty,
  isTrendEmpty,
} from './report-state';

function dataOf<T>(state: ReportState<T>): T | null {
  return state.status === 'ready' ? state.data : null;
}

function messageOf<T>(state: ReportState<T>): string {
  return state.status === 'error' ? state.message : '';
}

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [
    ReportCardComponent,
    FunnelChartComponent,
    HorizontalBarChartComponent,
    BarChartComponent,
    LineChartComponent,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6 max-w-[1400px] mx-auto">
      <div class="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 class="text-xl font-bold text-white">Reports & Analytics</h1>
          <p class="text-sm text-slate-400 mt-0.5">
            Funnel, sources, industries and signals of all leads. The date range applies to the
            score trend.
          </p>
        </div>
        <div
          role="group"
          aria-label="Date range"
          class="flex rounded-lg border border-slate-700 overflow-hidden"
        >
          @for (option of ranges; track option) {
            <button
              type="button"
              class="px-3 py-1.5 text-sm transition-colors"
              [class]="
                days() === option
                  ? 'bg-blue-600 text-white'
                  : 'bg-slate-800 text-slate-300 hover:bg-slate-700'
              "
              [attr.aria-pressed]="days() === option"
              (click)="setDays(option)"
            >
              {{ option }} days
            </button>
          }
        </div>
      </div>

      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <app-report-card
          title="Pipeline funnel"
          [status]="funnel().status"
          [empty]="funnelEmpty()"
          [errorMessage]="funnelError()"
          [table]="tables().funnel"
          (retry)="retry('funnel')"
          (exportCsv)="export('funnel', 'csv')"
          (exportJson)="export('funnel', 'json')"
        >
          <app-funnel-chart
            [steps]="funnelSteps()"
            ariaLabel="Pipeline funnel: leads reaching each stage"
          />
        </app-report-card>

        <app-report-card
          title="Leads by source"
          [status]="bySource().status"
          [empty]="bySourceEmpty()"
          [errorMessage]="bySourceError()"
          [table]="tables().bySource"
          (retry)="retry('by-source')"
          (exportCsv)="export('by-source', 'csv')"
          (exportJson)="export('by-source', 'json')"
        >
          <app-horizontal-bar-chart [data]="sourceData()" ariaLabel="Leads by source" />
        </app-report-card>

        <app-report-card
          title="Leads by industry"
          [status]="byIndustry().status"
          [empty]="byIndustryEmpty()"
          [errorMessage]="byIndustryError()"
          [table]="tables().byIndustry"
          (retry)="retry('by-industry')"
          (exportCsv)="export('by-industry', 'csv')"
          (exportJson)="export('by-industry', 'json')"
        >
          <app-horizontal-bar-chart [data]="industryData()" ariaLabel="Leads by industry" />
        </app-report-card>

        <app-report-card
          title="Signal mix"
          [status]="signals().status"
          [empty]="signalsEmpty()"
          [errorMessage]="signalsError()"
          [table]="tables().signals"
          (retry)="retry('signals')"
          (exportCsv)="export('signals', 'csv')"
          (exportJson)="export('signals', 'json')"
        >
          <app-bar-chart [data]="signalData()" ariaLabel="Signals per type" />
        </app-report-card>
      </div>

      <app-report-card
        [title]="'Score trend — last ' + days() + ' days'"
        [status]="trend().status"
        [empty]="trendEmpty()"
        [errorMessage]="trendError()"
        [table]="tables().trend"
        (retry)="retry('score-trend')"
        (exportCsv)="export('score-trend', 'csv')"
        (exportJson)="export('score-trend', 'json')"
      >
        <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">
          <div>
            <h3 class="text-xs text-slate-400 mb-2">New leads per day</h3>
            <app-bar-chart [data]="newLeadsData()" ariaLabel="New leads per day" />
          </div>
          <div>
            <h3 class="text-xs text-slate-400 mb-2">Average score per day</h3>
            <app-line-chart [data]="avgScoreData()" ariaLabel="Average lead score per day" />
          </div>
        </div>
      </app-report-card>
    </div>
  `,
})
export class ReportsComponent {
  private readonly source = inject(AnalyticsDataSource);
  private readonly subscriptions = new Map<ReportId, Subscription>();

  readonly ranges = RANGE_OPTIONS;
  readonly days = signal<RangeDays>(DEFAULT_RANGE);

  readonly funnel = signal<ReportState<FunnelDto>>(LOADING);
  readonly bySource = signal<ReportState<BreakdownDto>>(LOADING);
  readonly byIndustry = signal<ReportState<BreakdownDto>>(LOADING);
  readonly signals = signal<ReportState<SignalMixDto>>(LOADING);
  readonly trend = signal<ReportState<ScoreTrendDto>>(LOADING);

  readonly funnelEmpty = computed(() => {
    const d = dataOf(this.funnel());
    return d !== null && isFunnelEmpty(d);
  });
  readonly bySourceEmpty = computed(() => {
    const d = dataOf(this.bySource());
    return d !== null && isBreakdownEmpty(d);
  });
  readonly byIndustryEmpty = computed(() => {
    const d = dataOf(this.byIndustry());
    return d !== null && isBreakdownEmpty(d);
  });
  readonly signalsEmpty = computed(() => {
    const d = dataOf(this.signals());
    return d !== null && isSignalMixEmpty(d);
  });
  readonly trendEmpty = computed(() => {
    const d = dataOf(this.trend());
    return d !== null && isTrendEmpty(d);
  });

  readonly funnelError = computed(() => messageOf(this.funnel()));
  readonly bySourceError = computed(() => messageOf(this.bySource()));
  readonly byIndustryError = computed(() => messageOf(this.byIndustry()));
  readonly signalsError = computed(() => messageOf(this.signals()));
  readonly trendError = computed(() => messageOf(this.trend()));

  /** Each table is the visible fallback of its chart and the input of the export. */
  readonly tables = computed(() => {
    const funnel = dataOf(this.funnel());
    const bySource = dataOf(this.bySource());
    const byIndustry = dataOf(this.byIndustry());
    const signals = dataOf(this.signals());
    const trend = dataOf(this.trend());
    return {
      funnel: funnel && funnelTable(funnel),
      bySource: bySource && breakdownTable('by-source', bySource),
      byIndustry: byIndustry && breakdownTable('by-industry', byIndustry),
      signals: signals && signalsTable(signals),
      trend: trend && scoreTrendTable(trend),
    };
  });

  readonly funnelSteps = computed(() =>
    (dataOf(this.funnel())?.stages ?? []).map((s, i) => ({
      label: s.stage,
      count: s.count,
      conversion: i === 0 ? null : s.conversionFromPrevious,
    })),
  );
  readonly sourceData = computed(() => this.breakdownData(dataOf(this.bySource())));
  readonly industryData = computed(() => this.breakdownData(dataOf(this.byIndustry())));
  readonly signalData = computed(() =>
    (dataOf(this.signals())?.items ?? []).map((i) => ({ label: i.type, value: i.count })),
  );
  readonly newLeadsData = computed(() =>
    (dataOf(this.trend())?.points ?? []).map((p) => ({
      label: p.date.slice(5),
      value: p.newLeads,
    })),
  );
  readonly avgScoreData = computed(() =>
    (dataOf(this.trend())?.points ?? []).map((p) => ({
      label: p.date.slice(5),
      value: p.avgScore,
    })),
  );

  constructor() {
    inject(DestroyRef).onDestroy(() => this.subscriptions.forEach((s) => s.unsubscribe()));
    this.loadAll();
  }

  setDays(days: RangeDays): void {
    if (days === this.days()) return;
    this.days.set(days);
    this.load('score-trend');
  }

  retry(id: ReportId): void {
    this.load(id);
  }

  /** Exports the report that is currently shown; does nothing while it is loading or failed. */
  export(id: ReportId, format: ExportFormat, now: Date = new Date()): void {
    const table = this.tableOf(id);
    if (!table || table.rows.length === 0) return;
    const text =
      format === 'csv'
        ? reportToCsv(table)
        : reportToJson(table, now, id === 'score-trend' ? this.days() : undefined);
    this.save(exportFilename(table, format, now), text, format);
  }

  /** Browser download; a separate method so tests can replace it. */
  save(filename: string, text: string, format: ExportFormat): void {
    downloadText(filename, text, format);
  }

  private loadAll(): void {
    for (const id of ['funnel', 'by-source', 'by-industry', 'signals', 'score-trend'] as const) {
      this.load(id);
    }
  }

  private load(id: ReportId): void {
    switch (id) {
      case 'funnel':
        return this.run(id, this.source.funnel(), this.funnel);
      case 'by-source':
        return this.run(id, this.source.bySource(), this.bySource);
      case 'by-industry':
        return this.run(id, this.source.byIndustry(), this.byIndustry);
      case 'signals':
        return this.run(id, this.source.signals(), this.signals);
      case 'score-trend':
        return this.run(id, this.source.scoreTrend(this.days()), this.trend);
    }
  }

  /** Replaces any in-flight request of the same report, so a slow old range cannot overwrite a new one. */
  private run<T>(
    id: ReportId,
    request: Observable<T>,
    target: WritableSignal<ReportState<T>>,
  ): void {
    this.subscriptions.get(id)?.unsubscribe();
    target.set(LOADING);
    this.subscriptions.set(
      id,
      request.subscribe({
        next: (data) => target.set({ status: 'ready', data }),
        error: (error) => target.set({ status: 'error', message: describeError(error) }),
      }),
    );
  }

  private tableOf(id: ReportId): ReportTable | null {
    const t = this.tables();
    switch (id) {
      case 'funnel':
        return t.funnel;
      case 'by-source':
        return t.bySource;
      case 'by-industry':
        return t.byIndustry;
      case 'signals':
        return t.signals;
      case 'score-trend':
        return t.trend;
    }
  }

  private breakdownData(dto: BreakdownDto | null) {
    return (dto?.items ?? []).map((i) => ({
      label: i.label,
      value: i.count,
      detail: `avg score ${i.avgScore}`,
    }));
  }
}
