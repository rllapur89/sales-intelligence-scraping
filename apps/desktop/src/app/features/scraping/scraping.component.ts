import {
  Component, ChangeDetectionStrategy, inject, signal
} from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe, DecimalPipe, DatePipe, NgTemplateOutlet } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { toSignal } from '@angular/core/rxjs-interop';

import { ScrapingActions } from '../../core/store/scraping/scraping.actions';
import {
  selectActiveJobs, selectCompletedJobs, selectFailedJobs,
  selectScrapingLoading, selectActiveTab, selectTotalLeadsFound, selectJobSuccessRate
} from '../../core/store/scraping/scraping.selectors';
import { SOURCE_KEYS, SOURCE_POLICIES, type SourceKey } from '@leads/shared';
import { ScrapingSource } from '../../core/models/scraping-job.model';
import { DATA_MODE } from '../../core/config/app-environment';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';

const SOURCE_LABELS: Record<SourceKey, string> = {
  greenhouse: 'Greenhouse',
  lever: 'Lever',
  'hn-hiring': 'HN Hiring',
  remoteok: 'RemoteOK',
  github: 'GitHub',
  'sec-edgar': 'SEC EDGAR',
  website: 'Website',
};

const SOURCE_ICONS: Record<SourceKey, string> = {
  greenhouse: '🌱',
  lever: '🧭',
  'hn-hiring': '📰',
  remoteok: '🏝️',
  github: '🐙',
  'sec-edgar': '🏛️',
  website: '🌐',
};

@Component({
  selector: 'app-scraping',
  standalone: true,
  imports: [AsyncPipe, DecimalPipe, FormsModule, StatusBadgeComponent, RelativeTimePipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-5 max-w-[1200px] mx-auto">

      <!-- Header -->
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Scraping Jobs</h1>
          <p class="text-sm text-slate-400 mt-0.5">Public-source scraping monitor — job progress</p>
        </div>
        <button (click)="showNewJobModal.set(true)"
                class="flex items-center gap-2 px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
          <span>🕷️</span> New Scraping Job
        </button>
      </div>

      <!-- Stats row -->
      <div class="grid grid-cols-4 gap-4">
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-blue-400 font-mono">{{ (activeJobs$ | async)?.length ?? 0 }}</div>
          <div class="text-xs text-slate-400 mt-1">Active Jobs</div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-emerald-400 font-mono">{{ (completedJobs$ | async)?.length ?? 0 }}</div>
          <div class="text-xs text-slate-400 mt-1">Completed</div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold text-white font-mono">{{ (totalLeadsFound$ | async) ?? 0 | number }}</div>
          <div class="text-xs text-slate-400 mt-1">Total Items Found</div>
        </div>
        <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 text-center">
          <div class="text-2xl font-bold font-mono"
               [class]="((successRate$ | async) ?? 0) >= 80 ? 'text-emerald-400' : 'text-yellow-400'">
            {{ (successRate$ | async) ?? 0 }}%
          </div>
          <div class="text-xs text-slate-400 mt-1">Success Rate</div>
        </div>
      </div>

      <!-- Tabs -->
      <div class="flex gap-1 bg-slate-800/50 border border-slate-700/50 rounded-lg p-1 w-fit">
        @for (tab of tabs; track tab.key) {
          <button (click)="store.dispatch(actions.setActiveTab({ tab: tab.key }))"
                  class="px-4 py-1.5 text-sm rounded-md transition-colors"
                  [class]="activeTab() === tab.key ? 'bg-slate-700 text-white font-medium' : 'text-slate-400 hover:text-white'">
            {{ tab.label }}
            @if (tab.key === 'active' && (activeJobs$ | async)?.length) {
              <span class="ml-1.5 bg-blue-500 text-white text-[10px] px-1.5 py-0.5 rounded-full font-bold">
                {{ (activeJobs$ | async)?.length }}
              </span>
            }
          </button>
        }
      </div>

      <!-- Job list -->
      <div class="space-y-3">
        @if (loading()) {
          @for (i of [1,2,3]; track i) {
            <div class="h-28 bg-slate-800 rounded-xl animate-pulse border border-slate-700"></div>
          }
        }

        @if (activeTab() === 'active') {
          @if ((activeJobs$ | async)?.length === 0) {
            <div class="text-center py-12 text-slate-500">
              <div class="text-4xl mb-3">🕷️</div>
              <p class="text-sm">No active jobs. Start a new scraping job above.</p>
            </div>
          }
          @for (job of (activeJobs$ | async); track job.id) {
            <div class="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 space-y-3 transition-colors">
              <div class="flex items-start justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">{{ sourceIcon(job.source) }}</span>
                  <div>
                    <div class="font-semibold text-white">{{ job.name }}</div>
                    <div class="text-xs text-slate-500 flex items-center gap-2 mt-0.5">
                      <span>{{ job.source }}</span>
                      @if (job.startedAt) { <span>· Started {{ job.startedAt | relativeTime }}</span> }
                    </div>
                  </div>
                </div>
                <div class="flex items-center gap-2 shrink-0">
                  <app-status-badge [value]="job.status" type="job" />
                  @if (job.status === 'queued' && isMock) {
                    <button (click)="store.dispatch(actions.promoteJob({ id: job.id }))"
                            class="px-2.5 py-1 text-xs text-emerald-400 hover:text-emerald-300 border border-emerald-800 hover:border-emerald-600 rounded-lg transition-colors">
                      Start
                    </button>
                  }
                  <button (click)="store.dispatch(actions.cancelJob({ id: job.id }))"
                          class="px-2.5 py-1 text-xs text-slate-400 hover:text-red-400 border border-slate-700 rounded-lg transition-colors">
                    Cancel
                  </button>
                </div>
              </div>
              <div>
                <div class="flex justify-between text-xs mb-1.5">
                  <span class="text-slate-400">
                    <span class="font-mono text-blue-400 font-bold">{{ job.leadsFound | number }}</span> items found
                    @if (job.errorCount > 0) { <span class="text-red-400 ml-2">· {{ job.errorCount }} errors</span> }
                  </span>
                  <span class="text-slate-500 font-mono">{{ job.progress }}%</span>
                </div>
                <div class="h-2 bg-slate-700 rounded-full overflow-hidden">
                  <div class="h-full bg-blue-500 rounded-full transition-all duration-500 relative overflow-hidden"
                       [style.width]="job.progress + '%'">
                    <div class="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent animate-shimmer"></div>
                  </div>
                </div>
              </div>
            </div>
          }
        }

        @if (activeTab() === 'completed') {
          @for (job of (completedJobs$ | async); track job.id) {
            <div class="bg-slate-800 border border-slate-700 hover:border-slate-600 rounded-xl p-4 transition-colors">
              <div class="flex items-center justify-between gap-4">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">{{ sourceIcon(job.source) }}</span>
                  <div>
                    <div class="font-semibold text-white">{{ job.name }}</div>
                    <div class="text-xs text-slate-500">Completed {{ job.completedAt | relativeTime }}</div>
                  </div>
                </div>
                <div class="flex items-center gap-3">
                  <span class="text-emerald-400 font-bold font-mono text-sm">✓ {{ job.leadsFound | number }} items</span>
                  <app-status-badge [value]="job.status" type="job" />
                </div>
              </div>
            </div>
          }
        }

        @if (activeTab() === 'failed') {
          @if ((failedJobs$ | async)?.length === 0) {
            <div class="text-center py-12 text-slate-500">
              <div class="text-4xl mb-3">✅</div>
              <p class="text-sm">No failed jobs.</p>
            </div>
          }
          @for (job of (failedJobs$ | async); track job.id) {
            <div class="bg-slate-800 border border-red-500/20 rounded-xl p-4">
              <div class="flex items-center justify-between">
                <div class="flex items-center gap-3">
                  <span class="text-2xl">{{ sourceIcon(job.source) }}</span>
                  <div>
                    <div class="font-semibold text-white">{{ job.name }}</div>
                    <div class="text-xs text-slate-500">Failed at {{ job.progress }}% · {{ job.errorCount }} errors</div>
                  </div>
                </div>
                <div class="flex items-center gap-2">
                  <app-status-badge [value]="job.status" type="job" />
                  <button (click)="store.dispatch(actions.retryJob({ id: job.id }))"
                          class="px-3 py-1.5 text-xs bg-red-600/20 hover:bg-red-600/30 text-red-400 border border-red-500/30 rounded-lg transition-colors">
                    🔄 Retry
                  </button>
                </div>
              </div>
            </div>
          }
        }
      </div>
    </div>

    <!-- New Job Modal -->
    @if (showNewJobModal()) {
      <div class="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4">
        <div class="bg-slate-800 border border-slate-700 rounded-2xl w-full max-w-lg shadow-2xl">
          <div class="flex items-center justify-between p-5 border-b border-slate-700">
            <h2 class="text-lg font-bold text-white">Configure Scraping Job</h2>
            <button (click)="showNewJobModal.set(false)" class="text-slate-500 hover:text-white text-2xl leading-none">×</button>
          </div>
          <div class="p-5 space-y-4">
            @if (isMock) {
            <div>
              <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">Job Name</label>
              <input [(ngModel)]="newJobName" type="text" placeholder="e.g. Greenhouse hiring signals"
                     class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
            }
            <div>
              <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">Source</label>
              <div class="grid grid-cols-3 gap-2">
                @for (src of sources; track src.key) {
                  <button (click)="newJobSource.set(src.key)" [disabled]="!src.enabled"
                          [title]="src.enabled ? '' : 'Source policy not reviewed yet'"
                          
                          class="flex items-center gap-2 px-3 py-2 rounded-lg border text-sm transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
                          [class]="newJobSource() === src.key ? 'bg-blue-600/20 border-blue-500/50 text-blue-400' : 'border-slate-700 text-slate-400 hover:border-slate-600'">
                    <span>{{ src.icon }}</span><span>{{ src.label }}</span>
                  </button>
                }
              </div>
            </div>
            <div>
              <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5">Company slugs (optional)</label>
              <input [(ngModel)]="newJobSlugs" type="text" placeholder="comma separated, e.g. stripe, airbnb"
                     class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
              <p class="text-[10px] text-slate-600 mt-1">Leave empty to scrape every configured target.</p>
            </div>
            <div class="flex gap-3 pt-2">
              <button (click)="showNewJobModal.set(false)"
                      class="flex-1 py-2.5 border border-slate-700 text-slate-300 rounded-lg text-sm hover:border-slate-600 transition-colors">
                Cancel
              </button>
              <button (click)="startJob()"
                      [disabled]="isMock && !newJobName"
                      class="flex-1 py-2.5 bg-blue-600 hover:bg-blue-500 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-lg text-sm transition-colors">
                🚀 Start Job
              </button>
            </div>
          </div>
        </div>
      </div>
    }
  `,
})
export class ScrapingComponent {
  readonly store = inject(Store);
  readonly actions = ScrapingActions;

  readonly activeJobs$ = this.store.select(selectActiveJobs);
  readonly completedJobs$ = this.store.select(selectCompletedJobs);
  readonly failedJobs$ = this.store.select(selectFailedJobs);
  readonly totalLeadsFound$ = this.store.select(selectTotalLeadsFound);
  readonly successRate$ = this.store.select(selectJobSuccessRate);

  readonly loading = toSignal(this.store.select(selectScrapingLoading), { initialValue: false });
  readonly activeTab = toSignal(this.store.select(selectActiveTab), { initialValue: 'active' as const });

  readonly isMock = inject(DATA_MODE) === 'mock';

  readonly showNewJobModal = signal(false);
  newJobName = '';
  newJobSlugs = '';
  readonly newJobSource = signal<ScrapingSource>('greenhouse');

  readonly tabs = [
    { key: 'active' as const, label: 'Active' },
    { key: 'completed' as const, label: 'Completed' },
    { key: 'failed' as const, label: 'Failed / Cancelled' },
  ];

  /** Live mode only accepts sources whose policy was reviewed (the API rejects the rest). */
  readonly sources = SOURCE_KEYS.map(key => ({
    key,
    label: SOURCE_LABELS[key],
    icon: SOURCE_ICONS[key],
    enabled: this.isMock || SOURCE_POLICIES[key].reviewed,
  }));

  startJob(): void {
    if (this.isMock && !this.newJobName) return;
    const source = this.newJobSource();
    this.store.dispatch(ScrapingActions.startJob({
      name: this.newJobName || source,
      source,
      slugs: this.newJobSlugs.split(',').map(s => s.trim()).filter(Boolean),
    }));
    this.showNewJobModal.set(false);
    this.newJobName = '';
    this.newJobSlugs = '';
  }

  sourceIcon(source: string): string {
    return (SOURCE_ICONS as Record<string, string>)[source] ?? '🔍';
  }
}
