import {
  Component, ChangeDetectionStrategy, inject, signal, computed, OnInit
} from '@angular/core';
import { Store } from '@ngrx/store';
import { MockDataService } from '../../core/services/mock-data.service';
import { ChartPoint } from '../../core/models/metrics.model';
import { DecimalPipe } from '@angular/common';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectCompletedJobs } from '../../core/store/scraping/scraping.selectors';
import { map } from 'rxjs/operators';

@Component({
  selector: 'app-reports',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-6 max-w-[1400px] mx-auto">

      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Reports & Analytics</h1>
          <p class="text-sm text-slate-400 mt-0.5">30-day performance overview</p>
        </div>
        <button (click)="exportCsv()"
                class="flex items-center gap-2 px-4 py-2 border border-slate-700 hover:border-slate-600 text-slate-300 text-sm rounded-lg transition-colors">
          📤 Export CSV
        </button>
      </div>

      <!-- Top metrics -->
      <div class="grid grid-cols-2 lg:grid-cols-4 gap-4">
        @for (metric of summaryMetrics; track metric.label) {
          <div class="bg-slate-800 border border-slate-700 rounded-xl p-4">
            <div class="text-2xl font-bold font-mono text-white">{{ metric.value }}</div>
            <div class="text-xs text-slate-400 mt-0.5">{{ metric.label }}</div>
            <div class="text-xs mt-1" [class]="metric.delta > 0 ? 'text-emerald-400' : 'text-red-400'">
              {{ metric.delta > 0 ? '+' : '' }}{{ metric.delta }}% vs last month
            </div>
          </div>
        }
      </div>

      <!-- Charts row 1 -->
      <div class="grid grid-cols-1 lg:grid-cols-2 gap-6">

        <!-- Line chart: leads by day -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-white mb-4">Leads Generated — Last 30 Days</h2>
          <div class="relative h-48">
            <svg viewBox="0 0 300 100" class="w-full h-full" preserveAspectRatio="none">
              <!-- Grid lines -->
              @for (line of [0, 25, 50, 75, 100]; track line) {
                <line x1="0" [attr.y1]="100 - line" x2="300" [attr.y2]="100 - line"
                      stroke="#1e293b" stroke-width="0.5" />
              }
              <!-- Area fill -->
              <path [attr.d]="lineAreaPath()" fill="url(#lineGrad)" opacity="0.4" />
              <!-- Line -->
              <path [attr.d]="linePath()" fill="none" stroke="#3b82f6" stroke-width="1.5"
                    stroke-linejoin="round" stroke-linecap="round" />
              <!-- Gradient def -->
              <defs>
                <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="0%" stop-color="#3b82f6" />
                  <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
                </linearGradient>
              </defs>
            </svg>
            <div class="absolute bottom-0 left-0 right-0 flex justify-between text-[9px] text-slate-600">
              @for (label of xAxisLabels(); track $index) {
                <span>{{ label }}</span>
              }
            </div>
          </div>
        </div>

        <!-- Horizontal bar: top companies -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-white mb-4">Top Companies by Lead Count</h2>
          <div class="space-y-2">
            @for (item of topCompanies().slice(0, 8); track item.label) {
              <div class="flex items-center gap-3">
                <div class="text-xs text-slate-400 w-28 truncate shrink-0">{{ item.label }}</div>
                <div class="flex-1 h-5 bg-slate-700 rounded overflow-hidden">
                  <div class="h-full bg-blue-500 rounded transition-all duration-700 flex items-center justify-end pr-2"
                       [style.width]="(item.value / maxCompany()) * 100 + '%'">
                    <span class="text-[9px] text-white font-bold">{{ item.value }}</span>
                  </div>
                </div>
              </div>
            }
          </div>
        </div>
      </div>

      <!-- Charts row 2 -->
      <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">

        <!-- Donut: industry distribution -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5">
          <h2 class="text-sm font-semibold text-white mb-4">Industry Distribution</h2>
          <div class="flex flex-col items-center gap-4">
            <svg viewBox="0 0 120 120" class="w-36 h-36">
              @for (seg of donutSegments(); track $index) {
                <circle cx="60" cy="60" r="45"
                        fill="none"
                        [attr.stroke]="colors[$index % colors.length]"
                        stroke-width="12"
                        [attr.stroke-dasharray]="seg.dash + ' ' + seg.gap"
                        [attr.stroke-dashoffset]="seg.offset"
                        class="transition-all duration-700" />
              }
              <text x="60" y="65" text-anchor="middle" fill="white" font-size="14" font-weight="bold">
                12
              </text>
            </svg>
            <div class="w-full space-y-1.5">
              @for (item of industryChart().slice(0, 6); track item.label) {
                <div class="flex items-center gap-2 text-xs">
                  <div class="w-2.5 h-2.5 rounded-sm shrink-0" [style.background]="colors[$index % colors.length]"></div>
                  <span class="text-slate-400 flex-1 truncate">{{ item.label }}</span>
                  <span class="text-slate-500 font-mono">{{ item.value }}</span>
                </div>
              }
            </div>
          </div>
        </div>

        <!-- Scraping source performance -->
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 lg:col-span-2">
          <h2 class="text-sm font-semibold text-white mb-4">Scraping Source Performance</h2>
          <div class="overflow-x-auto">
            <table class="w-full text-xs">
              <thead>
                <tr class="text-slate-500 border-b border-slate-700">
                  <th class="text-left py-2 pr-4">Source</th>
                  <th class="text-right py-2 pr-4">Jobs</th>
                  <th class="text-right py-2 pr-4">Leads</th>
                  <th class="text-right py-2 pr-4">Success</th>
                  <th class="text-right py-2">Avg/Job</th>
                </tr>
              </thead>
              <tbody>
                @for (row of sourceStats; track row.source) {
                  <tr class="border-b border-slate-800 hover:bg-slate-700/30">
                    <td class="py-2.5 pr-4">
                      <div class="flex items-center gap-2">
                        <span>{{ row.icon }}</span>
                        <span class="text-slate-300">{{ row.source }}</span>
                      </div>
                    </td>
                    <td class="text-right py-2.5 pr-4 text-slate-400 font-mono">{{ row.jobs }}</td>
                    <td class="text-right py-2.5 pr-4 text-slate-300 font-mono font-bold">{{ row.leads | number }}</td>
                    <td class="text-right py-2.5 pr-4">
                      <span class="font-mono" [class]="row.successRate >= 80 ? 'text-emerald-400' : 'text-yellow-400'">
                        {{ row.successRate }}%
                      </span>
                    </td>
                    <td class="text-right py-2.5 text-slate-500 font-mono">{{ row.avgPerJob | number }}</td>
                  </tr>
                }
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  `,
})
export class ReportsComponent implements OnInit {
  private mockData = inject(MockDataService);

  readonly dailyChart = signal<ChartPoint[]>([]);
  readonly industryChart = signal<ChartPoint[]>([]);
  readonly topCompanies = signal<ChartPoint[]>([]);

  readonly colors = ['#3b82f6','#10b981','#f59e0b','#8b5cf6','#ef4444','#06b6d4','#84cc16','#f97316'];

  readonly summaryMetrics = [
    { label: 'Total Leads (30d)', value: '24,832', delta: 18.4 },
    { label: 'Jobs Completed', value: '142', delta: 7.2 },
    { label: 'Avg Score', value: '73', delta: 3.1 },
    { label: 'Success Rate', value: '84%', delta: -2.1 },
  ];

  readonly sourceStats = [
    { source: 'LinkedIn', icon: '💼', jobs: 48, leads: 12480, successRate: 92, avgPerJob: 260 },
    { source: 'Company Website', icon: '🌐', jobs: 35, leads: 6200, successRate: 78, avgPerJob: 177 },
    { source: 'Crunchbase', icon: '🚀', jobs: 22, leads: 3800, successRate: 88, avgPerJob: 173 },
    { source: 'Ind. Directory', icon: '📁', jobs: 28, leads: 7100, successRate: 71, avgPerJob: 254 },
    { source: 'GitHub', icon: '🐙', jobs: 9, leads: 1252, successRate: 95, avgPerJob: 139 },
  ];

  ngOnInit(): void {
    this.dailyChart.set(this.mockData.getDailyChart());
    this.industryChart.set(this.mockData.getIndustryChart());
    this.topCompanies.set(this.mockData.getTopCompanies());
  }

  readonly maxCompany = computed(() =>
    Math.max(...this.topCompanies().map(p => p.value), 1)
  );

  readonly maxDaily = computed(() =>
    Math.max(...this.dailyChart().map(p => p.value), 1)
  );

  readonly xAxisLabels = computed(() => {
    const data = this.dailyChart();
    return [data[0]?.label, data[7]?.label, data[14]?.label, data[21]?.label, data[29]?.label].filter(Boolean);
  });

  linePath(): string {
    const data = this.dailyChart();
    if (!data.length) return '';
    const max = this.maxDaily();
    const w = 300;
    const h = 100;
    return data.map((p, i) => {
      const x = (i / (data.length - 1)) * w;
      const y = h - (p.value / max) * (h - 10);
      return `${i === 0 ? 'M' : 'L'} ${x.toFixed(1)} ${y.toFixed(1)}`;
    }).join(' ');
  }

  lineAreaPath(): string {
    const line = this.linePath();
    const data = this.dailyChart();
    if (!line || !data.length) return '';
    const lastX = 300;
    return `${line} L ${lastX} 100 L 0 100 Z`;
  }

  readonly donutSegments = computed(() => {
    const data = this.industryChart().slice(0, 7);
    const total = data.reduce((s, p) => s + p.value, 0) || 1;
    const circ = 2 * Math.PI * 45;
    let offset = circ / 4;
    return data.map(p => {
      const dash = (p.value / total) * circ;
      const seg = { dash, gap: circ - dash, offset };
      offset -= dash;
      return seg;
    });
  });

  exportCsv(): void {
    const headers = 'Name,Company,Industry,Country,Role,Score,Status,Value\n';
    const rows = Array.from({ length: 5 }, (_, i) =>
      `Lead ${i + 1},Company ${i + 1},Technology,US,Director,${80 + i},qualified,50000`
    ).join('\n');
    const blob = new Blob([headers + rows], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `salesintel-leads-${Date.now()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  }
}
