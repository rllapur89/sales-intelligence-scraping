import {
  Component, ChangeDetectionStrategy, OnInit, inject, signal, computed, OnDestroy
} from '@angular/core';
import { Store } from '@ngrx/store';
import { DecimalPipe } from '@angular/common';
import { interval, Subscription } from 'rxjs';
import { toSignal } from '@angular/core/rxjs-interop';
import { PIPELINE_STAGES } from '@leads/shared';
import { MockDataService } from '../../core/services/mock-data.service';
import { ElectronService } from '../../core/services/electron.service';
import { MetricsDataSource } from '../../core/data/metrics.data-source';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { DATA_MODE } from '../../core/config/app-environment';
import { StatCardComponent } from '../../shared/components/stat-card/stat-card.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import {
  selectAllLeads, selectIndustryCounts, selectLeadsTotalCount
} from '../../core/store/leads/leads.selectors';
import {
  selectActiveJobs, selectAllJobs, selectJobSuccessRate
} from '../../core/store/scraping/scraping.selectors';
import { ActivityEvent, ChartPoint, DashboardMetrics } from '../../core/models/metrics.model';

const SOURCE_ICONS: Record<string, string> = {
  greenhouse: '🌱', lever: '🧭', 'hn-hiring': '📰', remoteok: '🏝️',
  github: '🐙', 'sec-edgar': '🏛️', website: '🌐',
};

@Component({
  selector: 'app-dashboard',
  standalone: true,
  imports: [DecimalPipe, StatCardComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6 max-w-[1400px] mx-auto">

      <!-- Page title -->
      <div>
        <h1 class="text-xl font-bold text-white">Dashboard</h1>
        <p class="text-sm text-slate-400 mt-0.5">Sales intelligence overview — real-time scraping monitor</p>
      </div>

      <!-- KPI Cards -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <app-stat-card
          label="Total Leads"
          [value]="totalLeads()"
          icon="👥"
          iconBg="bg-blue-500/15"
          [trend]="isMock ? 12.4 : 0"
          [subtitle]="isMock ? 'Companies with buying signals' : (metrics() ? 'Average score ' + metrics()!.avgScore : '')"
        />
        <app-stat-card
          label="Leads Today"
          [value]="leadsToday()"
          icon="⚡"
          iconBg="bg-emerald-500/15"
          [trend]="isMock ? 8.1 : 0"
          [subtitle]="isMock ? 'vs 247 yesterday' : (metrics() ? metrics()!.leadsThisWeek + ' this week' : '')"
        />
        <app-stat-card
          label="Active Jobs"
          [value]="activeJobsCount()"
          icon="🕷️"
          iconBg="bg-purple-500/15"
          format="raw"
          subtitle="Running + Queued"
        />
        <app-stat-card
          label="Success Rate"
          [value]="successRate()"
          icon="✅"
          iconBg="bg-amber-500/15"
          format="percent"
          [trend]="isMock ? -2.3 : 0"
          [subtitle]="isMock ? 'Last 24h scraping jobs' : 'Completed vs failed jobs'"
        />
      </div>

      <!-- Charts row -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-4">

        @if (isMock) {
          <!-- Hourly activity chart (bar SVG, simulated) -->
          <div class="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-white">Leads Found — Last 24 Hours</h2>
              <span class="text-xs text-slate-500 font-mono">Simulated</span>
            </div>
            <div class="relative h-36">
              <svg viewBox="0 0 100 40" class="w-full h-full" preserveAspectRatio="none">
                @for (point of hourlyChart(); track $index) {
                  <rect
                    [attr.x]="($index / hourlyChart().length) * 100 + 0.3"
                    [attr.width]="(100 / hourlyChart().length) - 0.6"
                    [attr.y]="40 - (point.value / maxHourly()) * 38"
                    [attr.height]="(point.value / maxHourly()) * 38"
                    [attr.fill]="$index === currentHour ? '#3b82f6' : '#1d4ed8'"
                    rx="0.5"
                    class="transition-all duration-700"
                    [attr.opacity]="0.3 + ($index / hourlyChart().length) * 0.7"
                  />
                }
              </svg>
              <div class="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-slate-400 px-0.5">
                <span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>23:00</span>
              </div>
            </div>
          </div>
        } @else {
          <!-- Pipeline stages (from the live lead list) -->
          <div class="lg:col-span-2 bg-slate-800 border border-slate-700 rounded-xl p-5">
            <div class="flex items-center justify-between mb-4">
              <h2 class="text-sm font-semibold text-white">Leads by Stage</h2>
              <span class="text-xs text-blue-400 font-mono">● LIVE</span>
            </div>
            <div class="space-y-2">
              @for (row of stageChart(); track row.label) {
                <div class="flex items-center gap-3 text-xs">
                  <span class="w-20 text-slate-400 capitalize">{{ row.label }}</span>
                  <div class="flex-1 h-4 bg-slate-700 rounded overflow-hidden">
                    <div class="h-full bg-blue-500 rounded transition-all duration-500"
                         [style.width.%]="(row.value / maxStage()) * 100"></div>
                  </div>
                  <span class="w-12 text-right font-mono text-slate-300">{{ row.value | number }}</span>
                </div>
              }
            </div>
          </div>
        }

        <!-- Industry distribution (donut SVG) -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-white mb-4">By Industry</h2>
          <div class="flex items-center gap-4">
            <!-- Donut SVG -->
            <svg viewBox="0 0 36 36" class="w-24 h-24 shrink-0">
              @for (segment of donutSegments(); track $index) {
                <circle
                  cx="18" cy="18" r="15.9"
                  fill="none"
                  [attr.stroke]="segment.color"
                  stroke-width="4"
                  [attr.stroke-dasharray]="segment.dash + ' ' + segment.gap"
                  [attr.stroke-dashoffset]="segment.offset"
                  class="transition-all duration-700"
                />
              }
              <text x="18" y="20" text-anchor="middle" class="text-[6px] fill-white font-bold">
                {{ industryChart().length }}
              </text>
            </svg>
            <!-- Legend -->
            <div class="space-y-1.5 min-w-0">
              @for (item of industryChart().slice(0, 5); track item.label) {
                <div class="flex items-center gap-2 text-[11px]">
                  <div class="w-2 h-2 rounded-full shrink-0" [style.background]="donutColors[$index]"></div>
                  <span class="text-slate-400 truncate">{{ item.label }}</span>
                  <span class="text-slate-500 ml-auto">{{ item.value }}</span>
                </div>
              }
            </div>
          </div>
        </div>
      </div>

      <!-- Bottom row: Active jobs + Activity feed -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-4">

        <!-- Active Scraping Jobs -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <div class="flex items-center justify-between mb-4">
            <h2 class="text-sm font-semibold text-white">Active Scraping Jobs</h2>
            <span class="text-xs text-blue-400 font-mono animate-pulse">● LIVE</span>
          </div>
          <div class="space-y-3">
            @if (activeJobs().length === 0) {
              <p class="text-sm text-slate-500 text-center py-4">No active jobs</p>
            }
            @for (job of activeJobs().slice(0, 4); track job.id) {
              <div class="space-y-1.5">
                <div class="flex items-center justify-between text-xs">
                  <div class="flex items-center gap-2">
                    <span class="text-base">{{ sourceIcon(job.source) }}</span>
                    <span class="text-slate-300 font-medium truncate max-w-[160px]">{{ job.name }}</span>
                  </div>
                  <div class="flex items-center gap-2 shrink-0">
                    <span class="text-slate-400 font-mono">{{ job.leadsFound | number }}</span>
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded"
                          [class]="job.status === 'running' ? 'bg-blue-500/20 text-blue-400' : 'bg-slate-600/40 text-slate-400'">
                      {{ job.status }}
                    </span>
                  </div>
                </div>
                <div class="h-1.5 bg-slate-700 rounded-full overflow-hidden">
                  <div class="h-full rounded-full transition-all duration-500"
                       [style.width]="job.progress + '%'"
                       [class]="job.status === 'running' ? 'bg-blue-500' : 'bg-slate-500'">
                  </div>
                </div>
              </div>
            }
          </div>
        </div>

        <!-- Activity feed (simulated in mock mode, recent jobs in live mode) -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col">
          <div class="flex items-center justify-between mb-4 shrink-0">
            <h2 class="text-sm font-semibold text-white">{{ isMock ? 'Activity Feed' : 'Recent Jobs' }}</h2>
            <span class="text-[10px] text-slate-500">{{ isMock ? 'Last events' : 'Newest first' }}</span>
          </div>
          <div class="flex-1 overflow-y-auto space-y-2 max-h-52 pr-1 scrollbar-thin">
            @for (event of feed(); track event.id) {
              <div class="flex items-start gap-3 text-xs py-1.5 border-b border-slate-700/50 last:border-0">
                <span class="text-base shrink-0 mt-0.5">{{ eventIcon(event.type) }}</span>
                <div class="flex-1 min-w-0">
                  <p class="text-slate-300 leading-snug">{{ event.message }}</p>
                  <p class="text-slate-600 mt-0.5">{{ event.timestamp | relativeTime }}</p>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- System Health -->
      <div class="bg-slate-800/50 border border-slate-700/50 rounded-xl p-4 flex items-center gap-6 flex-wrap">
        <span class="text-xs font-semibold text-slate-400 uppercase tracking-widest">System Health</span>
        @if (showMemory()) {
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500">Memory</span>
            <div class="h-1.5 w-24 bg-slate-700 rounded-full overflow-hidden">
              <div class="h-full bg-emerald-500 rounded-full transition-all" [style.width]="memPercent() + '%'"></div>
            </div>
            <span class="text-slate-400 font-mono">{{ memUsed() }}MB / {{ memTotalFormatted() }}</span>
          </div>
        }
        @if (!isMock) {
          <div class="flex items-center gap-2 text-xs">
            <span class="text-slate-500">Realtime</span>
            <span class="text-slate-300 font-mono">{{ realtime.status() }}</span>
          </div>
        }
        <div class="flex items-center gap-2 text-xs">
          <span class="text-slate-500">Queue</span>
          <span class="text-blue-400 font-mono font-bold">{{ queueSize() }}</span>
          <span class="text-slate-500">jobs pending</span>
        </div>
      </div>
    </div>
  `,
})
export class DashboardComponent implements OnInit, OnDestroy {
  private store = inject(Store);
  private mockData = inject(MockDataService);
  private electron = inject(ElectronService);
  private metricsSource = inject(MetricsDataSource);
  readonly realtime = inject(RealtimeService);
  readonly isMock = inject(DATA_MODE) === 'mock';
  private sub?: Subscription;
  private metricsSub?: Subscription;

  private refreshMemory(): void {
    this.electron.getMemoryUsage().then(mem => {
      if (mem) {
        this.memUsed.set(mem.rss);
        this.memTotal.set(mem.systemTotalMb);
        this.showMemory.set(true);
      } else if (this.isMock) {
        // Browser mock mode: simulate realistic values
        this.memUsed.set(Math.floor(150 + Math.random() * 80));
        this.memTotal.set(16384);
        this.showMemory.set(true);
      }
    });
  }

  private refreshMetrics(): void {
    this.metricsSub?.unsubscribe();
    this.metricsSub = this.metricsSource.summary().subscribe({
      next: m => this.metrics.set(m),
      error: () => this.metrics.set(null),
    });
  }

  // Signals
  readonly metrics = signal<DashboardMetrics | null>(null);
  readonly hourlyChart = signal<ChartPoint[]>([]);
  readonly mockFeed = signal<ActivityEvent[]>([]);
  readonly memUsed = signal(0);
  readonly memTotal = signal(0);
  readonly showMemory = signal(false);

  readonly activeJobs = toSignal(this.store.select(selectActiveJobs), { initialValue: [] });
  private readonly allJobs = toSignal(this.store.select(selectAllJobs), { initialValue: [] });
  private readonly allLeads = toSignal(this.store.select(selectAllLeads), { initialValue: [] });
  readonly industryChart = toSignal(this.store.select(selectIndustryCounts), { initialValue: [] as ChartPoint[] });
  private readonly storeTotal = toSignal(this.store.select(selectLeadsTotalCount), { initialValue: 0 });
  private readonly storeSuccessRate = toSignal(this.store.select(selectJobSuccessRate), { initialValue: 0 });
  private readonly mockLeadsToday = signal(Math.floor(Math.random() * 400) + 100);

  // Server counters win in live mode; mock mode derives everything from the store.
  readonly totalLeads = computed(() => this.metrics()?.totalLeads ?? this.storeTotal());
  readonly leadsToday = computed(() => this.metrics()?.leadsToday ?? (this.isMock ? this.mockLeadsToday() : 0));
  readonly activeJobsCount = computed(() => this.metrics()?.activeJobs ?? this.activeJobs().length);
  readonly successRate = computed(() => this.metrics()?.successRate ?? this.storeSuccessRate());
  readonly currentHour = new Date().getHours();

  readonly maxHourly = computed(() => Math.max(...this.hourlyChart().map(p => p.value), 1));
  readonly memPercent = computed(() => Math.round((this.memUsed() / (this.memTotal() || 1)) * 100));
  readonly memTotalFormatted = computed(() => {
    const mb = this.memTotal();
    return mb >= 1024 ? `${(mb / 1024).toFixed(1)}GB` : `${mb}MB`;
  });
  readonly queueSize = computed(() => this.activeJobs().length);

  readonly stageChart = computed<ChartPoint[]>(() => {
    const counts = new Map<string, number>();
    for (const lead of this.allLeads()) counts.set(lead.stage, (counts.get(lead.stage) ?? 0) + 1);
    return PIPELINE_STAGES.map(stage => ({ label: stage, value: counts.get(stage) ?? 0 }));
  });
  readonly maxStage = computed(() => Math.max(...this.stageChart().map(p => p.value), 1));

  /** Live mode: the newest jobs as feed entries. */
  private readonly jobFeed = computed<ActivityEvent[]>(() =>
    [...this.allJobs()]
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, 10)
      .map((job): ActivityEvent => ({
        id: job.id,
        type: job.status === 'failed' ? 'job_failed' : job.status === 'completed' ? 'job_completed' : 'job_started',
        message: `${job.name} — ${job.status} (${job.progress}%, ${job.leadsFound} items)`,
        timestamp: job.createdAt,
        meta: { source: job.source },
      }))
  );
  readonly feed = computed(() => (this.isMock ? this.mockFeed() : this.jobFeed()));

  readonly donutColors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16'];

  readonly donutSegments = computed(() => {
    const total = this.industryChart().reduce((s, p) => s + p.value, 0) || 1;
    const circumference = 100; // 2π*15.9 ≈ 100
    let offset = 25;
    return this.industryChart().slice(0, 7).map((p, i) => {
      const dash = (p.value / total) * circumference;
      const seg = { color: this.donutColors[i], dash, gap: circumference - dash, offset };
      offset -= dash;
      return seg;
    });
  });

  ngOnInit(): void {
    this.refreshMetrics();
    this.refreshMemory();

    if (this.isMock) {
      this.hourlyChart.set(this.mockData.getHourlyChart());
      this.mockFeed.set(this.mockData.getRecentActivity());
    }

    this.sub = interval(5000).subscribe(() => {
      if (this.isMock) {
        this.mockFeed.update(feed => {
          const event = this.mockData.getRecentActivity()[0];
          return [{ ...event, timestamp: new Date() }, ...feed.slice(0, 39)];
        });
      }
      this.refreshMetrics();
      this.refreshMemory();
    });
  }

  ngOnDestroy(): void {
    this.sub?.unsubscribe();
    this.metricsSub?.unsubscribe();
  }

  sourceIcon(source: string): string {
    return SOURCE_ICONS[source] ?? '🔍';
  }

  eventIcon(type: string): string {
    const map: Record<string, string> = {
      lead_found: '✅', job_started: '▶️', job_completed: '🎯', job_failed: '❌', export: '📤'
    };
    return map[type] ?? '📌';
  }
}
