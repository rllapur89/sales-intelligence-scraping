import {
  Component, ChangeDetectionStrategy, inject, signal, computed, OnInit
} from '@angular/core';
import { Store } from '@ngrx/store';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { toObservable, toSignal } from '@angular/core/rxjs-interop';
import { catchError, map, of, switchMap } from 'rxjs';
import { PIPELINE_STAGES } from '@leads/shared';

import { LeadsActions } from '../../core/store/leads/leads.actions';
import {
  selectFilteredLeads, selectLeadsLoading, selectSelectedLead,
  selectSelectedCount, selectHasSelection, selectIsAllSelected,
  selectLeadsFilter, selectFilteredCount, selectLeadsTotalCount, selectRescrapingIds,
  selectLeadsSelection, selectChangedIdSet, selectIndustryOptions, selectRegionOptions
} from '../../core/store/leads/leads.selectors';
import { Lead, CompanySize, LeadFilter, DEFAULT_FILTER, PipelineStage } from '../../core/models/lead.model';
import { LeadsDataSource } from '../../core/data/leads.data-source';
import { recentSignalViews } from '../../core/util/signal-view';
import { DATA_MODE } from '../../core/config/app-environment';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { AddLeadModalComponent } from './add-lead-modal/add-lead-modal.component';
import { HighlightDirective } from '../../shared/directives/highlight.directive';

const MAX_SIGNAL_CHIPS = 3;

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    DecimalPipe, FormsModule,
    ScrollingModule, StatusBadgeComponent, SkeletonComponent,
    EmptyStateComponent, RelativeTimePipe, AddLeadModalComponent, HighlightDirective
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-full overflow-hidden">

      <!-- Filter panel -->
      <aside class="w-64 shrink-0 bg-slate-900 border-r border-slate-800 flex flex-col overflow-y-auto"
             [class]="showFilters() ? 'flex' : 'hidden lg:flex'">
        <div class="p-4 border-b border-slate-800 flex items-center justify-between">
          <h3 class="text-sm font-semibold text-white">Filters</h3>
          <button (click)="store.dispatch(actions.resetFilter())"
                  class="text-xs text-slate-500 hover:text-blue-400 transition-colors cursor-pointer">Reset</button>
        </div>

        <div class="p-4 space-y-5 flex-1">
          <!-- Industries -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">Industry</label>
            <div class="space-y-1.5 max-h-56 overflow-y-auto">
              @for (ind of industries(); track ind) {
                <label class="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer">
                  <input type="checkbox" [checked]="isIndustrySelected(ind)"
                         (change)="toggleIndustry(ind)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30" />
                  <span>{{ ind }}</span>
                </label>
              }
            </div>
          </div>

          <!-- Regions -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">Region</label>
            <div class="space-y-1.5 max-h-40 overflow-y-auto">
              @for (region of regions(); track region) {
                <label class="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer">
                  <input type="checkbox" [checked]="isRegionSelected(region)"
                         (change)="toggleRegion(region)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500" />
                  <span>{{ region }}</span>
                </label>
              }
            </div>
          </div>

          <!-- Company size -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">Company Size</label>
            <div class="grid grid-cols-2 gap-1">
              @for (size of companySizes; track size) {
                <button (click)="toggleSize(size)"
                  class="px-2 py-1 text-xs rounded border transition-colors cursor-pointer"
                  [class]="isSizeSelected(size)
                    ? 'bg-blue-600/20 text-blue-400 border-blue-500/50'
                    : 'text-slate-400 border-slate-700 hover:border-slate-600'">
                  {{ size }}
                </button>
              }
            </div>
          </div>

          <!-- Stage -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">Stage</label>
            <div class="space-y-1.5">
              @for (st of stages; track st) {
                <label class="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer">
                  <input type="checkbox" [checked]="isStageSelected(st)"
                         (change)="toggleStage(st)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500" />
                  <span class="capitalize">{{ st }}</span>
                </label>
              }
            </div>
          </div>

          <!-- Score range -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
              Score: {{ filter().scoreMin }} – {{ filter().scoreMax }}
            </label>
            <div class="space-y-2">
              <input type="range" min="0" max="100"
                     [ngModel]="filter().scoreMin"
                     (ngModelChange)="onScoreMinChange($event)"
                     class="w-full accent-blue-500" />
              <input type="range" min="0" max="100"
                     [ngModel]="filter().scoreMax"
                     (ngModelChange)="onScoreMaxChange($event)"
                     class="w-full accent-blue-500" />
            </div>
          </div>
        </div>
      </aside>

      <!-- Main content -->
      <div class="flex-1 flex flex-col min-w-0 overflow-hidden">

        <!-- Toolbar -->
        <div class="px-4 py-3 border-b border-slate-800 flex items-center gap-3 shrink-0 flex-wrap bg-slate-900">
          <div class="flex items-center gap-3">
            <!-- Select all (inverted selection pattern) -->
            <label class="flex items-center gap-2 cursor-pointer">
              <input type="checkbox"
                     [checked]="isAllSelected()"
                     [indeterminate]="hasSelection() && !isAllSelected()"
                     (change)="toggleSelectAll()"
                     class="rounded border-slate-600 bg-slate-800 text-blue-500" />
            </label>
            <span class="text-sm text-slate-400">
              {{ filteredCount() | number }} leads
              @if (totalCount() !== filteredCount()) {
                <span class="text-slate-600"> (of {{ totalCount() | number }})</span>
              }
            </span>
          </div>

          <!-- Bulk action bar — aparece cuando hay selección -->
          @if (hasSelection()) {
            <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-600/20 border border-blue-500/30 rounded-lg">
              <span class="text-xs font-semibold text-blue-400">{{ selectedCount() }} selected</span>
              <div class="w-px h-4 bg-blue-500/30"></div>
              <button (click)="store.dispatch(actions.exportLeads())"
                      class="text-xs text-blue-400 hover:text-white transition-colors cursor-pointer">📤 Export</button>
              <button class="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer">🗑️ Delete</button>
            </div>
          }

          <div class="ml-auto flex items-center gap-2">
            <button (click)="showFilters.update(v => !v)"
                    class="lg:hidden px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg cursor-pointer">
              🔧 Filters
            </button>
            @if (canAddLead) {
              <button (click)="showAddLeadModal.set(true)"
                      class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer">
                + Add Lead
              </button>
            }
          </div>
        </div>

        <!-- Table header -->
        <div class="grid grid-cols-[32px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_100px_80px] gap-2 px-4 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800 bg-slate-900 shrink-0">
          <div></div>
          <div>Company</div>
          <div>Industry</div>
          <div>Region</div>
          <div>Signals</div>
          <div>Score</div>
          <div>Stage</div>
          <div>Updated</div>
        </div>

        <!-- Virtual scroll viewport — O(1) rendering de miles de leads -->
        @if (loading()) {
          <app-skeleton [count]="12" />
        } @else if (filteredLeads().length === 0) {
          <app-empty-state
            icon="🔍"
            title="No leads match your filters"
            message="Try adjusting the industry, stage, or score filters to see more results."
            actionLabel="Reset Filters"
            (action)="store.dispatch(actions.resetFilter())"
          />
        } @else {
          <cdk-virtual-scroll-viewport itemSize="56" class="flex-1 overflow-auto">
            <div *cdkVirtualFor="let lead of filteredLeads(); trackBy: trackByLeadId"
                 class="grid grid-cols-[32px_minmax(0,1.6fr)_minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.4fr)_minmax(0,1fr)_100px_80px] gap-2 px-4 items-center border-b border-slate-800/60 hover:bg-slate-800/50 cursor-pointer transition-colors group"
                 style="height: 56px"
                 [class]="rowClass(lead.id)"
                 (click)="selectLead(lead)">

              <!-- Checkbox -->
              <div (click)="$event.stopPropagation()">
                <input type="checkbox"
                       [checked]="isLeadSelected(lead.id)"
                       (change)="toggleLead(lead.id)"
                       class="rounded border-slate-600 bg-slate-800 text-blue-500" />
              </div>

              <!-- Company: name + domain -->
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {{ initial(lead) }}
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-slate-200 truncate"
                       [appHighlight]="lead.company.name"></div>
                  <div class="text-[11px] text-slate-500 truncate"
                       [appHighlight]="lead.company.domain"></div>
                </div>
              </div>

              <!-- Industry -->
              <div class="text-xs text-slate-400 truncate">{{ lead.company.industry ?? '—' }}</div>

              <!-- Region -->
              <div class="text-xs text-slate-500 truncate">{{ lead.company.region ?? '—' }}</div>

              <!-- Signals: type chips + count -->
              <div class="flex items-center gap-1 min-w-0 overflow-hidden">
                @for (type of lead.signalTypes.slice(0, maxSignalChips); track type) {
                  <span class="px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300 text-[10px] whitespace-nowrap">{{ type }}</span>
                }
                @if (lead.signalTypes.length > maxSignalChips) {
                  <span class="text-[10px] text-slate-500">+{{ lead.signalTypes.length - maxSignalChips }}</span>
                }
                <span class="ml-auto text-[11px] text-slate-400 font-mono shrink-0" title="Signals detected">{{ lead.signalCount }}</span>
              </div>

              <!-- Score: bar + number -->
              <div class="flex items-center gap-2">
                <div class="h-1.5 flex-1 bg-slate-700 rounded-full overflow-hidden">
                  <div class="h-full rounded-full"
                       [style.width.%]="lead.score"
                       [class]="scoreBarClass(lead.score)"></div>
                </div>
                <span class="w-7 text-right text-sm font-bold font-mono" [class]="scoreTextClass(lead.score)">
                  {{ lead.score }}
                </span>
              </div>

              <!-- Stage -->
              <div><app-status-badge [value]="lead.stage" type="lead" /></div>

              <!-- Updated -->
              <div class="text-[11px] text-slate-500">{{ lead.updatedAt | relativeTime }}</div>
            </div>
          </cdk-virtual-scroll-viewport>
        }
      </div>

      <!-- Detail sidebar -->
      @if (selectedLead(); as lead) {
        <aside class="w-80 shrink-0 border-l border-slate-800 bg-slate-900 overflow-y-auto flex flex-col">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Lead Detail</h3>
            <button (click)="store.dispatch(actions.deselectLead({ id: lead.id }))"
                    class="text-slate-500 hover:text-white transition-colors text-lg cursor-pointer">×</button>
          </div>

          <div class="p-4 space-y-5">
            <!-- Avatar + company -->
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white">
                {{ initial(lead) }}
              </div>
              <div class="min-w-0">
                <div class="font-semibold text-white truncate">{{ lead.company.name }}</div>
                <div class="text-sm text-blue-400 truncate">{{ lead.company.domain }}</div>
              </div>
            </div>

            <!-- Score bar -->
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-slate-400">Lead Score</span>
                <span class="font-bold font-mono" [class]="scoreTextClass(lead.score)">{{ lead.score }}/100</span>
              </div>
              <div class="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [style.width.%]="lead.score"
                     [class]="scoreBarClass(lead.score)">
                </div>
              </div>
            </div>

            <!-- Score inputs -->
            <div>
              <div class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Score inputs</div>
              <div class="space-y-2 text-sm">
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-500">Signals detected</span>
                  <span class="text-slate-300 font-mono">{{ lead.signalCount }}</span>
                </div>
                <div class="flex justify-between gap-3 py-1.5 border-b border-slate-800">
                  <span class="text-slate-500 shrink-0">Signal types</span>
                  <span class="flex flex-wrap justify-end gap-1">
                    @for (type of lead.signalTypes; track type) {
                      <span class="px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300 text-[10px]">{{ type }}</span>
                    } @empty {
                      <span class="text-slate-500">none</span>
                    }
                  </span>
                </div>
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-500">Last update</span>
                  <span class="text-slate-300 text-right">{{ lastUpdate() }}</span>
                </div>
              </div>
            </div>

            <!-- Company details -->
            <div class="space-y-2 text-sm">
              @for (item of detailItems(); track item.label) {
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-500">{{ item.label }}</span>
                  <span class="text-slate-300 text-right max-w-[160px] truncate">{{ item.value }}</span>
                </div>
              }
              <div class="flex justify-between items-center py-1.5 border-b border-slate-800">
                <span class="text-slate-500">Stage</span>
                <select [ngModel]="lead.stage" (ngModelChange)="changeStage(lead, $event)"
                        class="bg-slate-800 border border-slate-700 rounded px-2 py-0.5 text-xs text-slate-200 capitalize">
                  @for (st of stages; track st) {
                    <option [value]="st" class="capitalize">{{ st }}</option>
                  }
                </select>
              </div>
            </div>

            <!-- Tech hints -->
            @if (lead.company.techHints.length) {
              <div>
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Tech hints</div>
                <div class="flex flex-wrap gap-1.5">
                  @for (tech of lead.company.techHints; track tech) {
                    <span class="px-2 py-0.5 bg-slate-700 text-slate-300 text-[11px] rounded">{{ tech }}</span>
                  }
                </div>
              </div>
            }

            <!-- Recent signals -->
            <div data-testid="recent-signals">
              <div class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Recent signals</div>
              @if (recentSignals().length) {
                <ul class="space-y-2">
                  @for (s of recentSignals(); track s.id) {
                    <li class="text-xs border-b border-slate-800 pb-2">
                      <div class="flex items-center justify-between gap-2">
                        <span class="px-1.5 py-0.5 rounded bg-slate-700/70 text-slate-300 text-[10px]">{{ s.type }}</span>
                        <span class="text-slate-500">{{ s.date | relativeTime }}</span>
                      </div>
                      <div class="mt-1 text-slate-300 break-words">
                        @if (s.url) {
                          <a [href]="s.url" target="_blank" rel="noopener" class="hover:text-blue-400">{{ s.title }}</a>
                        } @else {
                          {{ s.title }}
                        }
                      </div>
                      @if (s.attribution; as via) {
                        <a [href]="via.url" target="_blank" rel="noopener"
                           class="text-[11px] text-blue-400 hover:underline">via {{ via.name }}</a>
                      }
                    </li>
                  }
                </ul>
              } @else {
                <div class="text-xs text-slate-500">No signals to show.</div>
              }
            </div>

            <!-- Actions -->
            <div class="space-y-2 pt-2">
              <button (click)="refreshLead(lead.id)"
                      [disabled]="rescrapingIds().has(lead.id)"
                      class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2">
                @if (rescrapingIds().has(lead.id)) {
                  <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Refreshing...
                } @else {
                  🔄 Refresh Lead
                }
              </button>
            </div>
          </div>
        </aside>
      }
    </div>

    @if (canAddLead) {
      <app-add-lead-modal
        [isOpen]="showAddLeadModal()"
        (closed)="showAddLeadModal.set(false)"
      />
    }
  `,
})
export class LeadsComponent implements OnInit {
  readonly store = inject(Store);
  readonly actions = LeadsActions;
  /** Creating leads by hand only exists in mock mode: the API has no such endpoint. */
  readonly canAddLead = inject(DATA_MODE) === 'mock';

  readonly showFilters = signal(false);
  readonly showAddLeadModal = signal(false);
  readonly maxSignalChips = MAX_SIGNAL_CHIPS;

  readonly loading = toSignal(this.store.select(selectLeadsLoading), { initialValue: false });
  readonly filteredLeads = toSignal(this.store.select(selectFilteredLeads), { initialValue: [] as Lead[] });
  readonly selectedLead = toSignal(this.store.select(selectSelectedLead), { initialValue: null });
  readonly rescrapingIds = toSignal(this.store.select(selectRescrapingIds), { initialValue: new Set<string>() });
  readonly changedIds = toSignal(this.store.select(selectChangedIdSet), { initialValue: new Set<string>() });
  private readonly leadsSource = inject(LeadsDataSource);

  /** Latest signals of the selected lead; reloaded when the selection or the lead version changes. */
  readonly recentSignals = toSignal(
    toObservable(
      computed(
        () => {
          const lead = this.selectedLead();
          return lead ? { lead, key: `${lead.id}:${lead.seq}` } : null;
        },
        { equal: (a, b) => a?.key === b?.key }
      )
    ).pipe(
      switchMap(sel =>
        sel
          ? this.leadsSource.loadSignals(sel.lead).pipe(
              map(signals => recentSignalViews(signals)),
              catchError(() => of([]))
            )
          : of([])
      )
    ),
    { initialValue: [] }
  );
  readonly selectedCount = toSignal(this.store.select(selectSelectedCount), { initialValue: 0 });
  readonly hasSelection = toSignal(this.store.select(selectHasSelection), { initialValue: false });
  readonly isAllSelected = toSignal(this.store.select(selectIsAllSelected), { initialValue: false });
  readonly filter = toSignal(this.store.select(selectLeadsFilter), { initialValue: DEFAULT_FILTER });
  readonly filteredCount = toSignal(this.store.select(selectFilteredCount), { initialValue: 0 });
  readonly totalCount = toSignal(this.store.select(selectLeadsTotalCount), { initialValue: 0 });
  readonly industries = toSignal(this.store.select(selectIndustryOptions), { initialValue: [] as string[] });
  readonly regions = toSignal(this.store.select(selectRegionOptions), { initialValue: [] as string[] });

  readonly selection = toSignal(this.store.select(selectLeadsSelection), { initialValue: { mode: 'include' as const, ids: [] as string[] } });

  readonly companySizes: CompanySize[] = ['startup', 'smb', 'mid-market', 'enterprise'];
  readonly stages: readonly PipelineStage[] = PIPELINE_STAGES;

  ngOnInit(): void {}

  trackByLeadId(_: number, lead: Lead): string { return lead.id; }

  initial(lead: Lead): string {
    return (lead.company.name[0] ?? '?').toUpperCase();
  }

  scoreBarClass(score: number): string {
    return score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-yellow-500' : 'bg-slate-500';
  }

  scoreTextClass(score: number): string {
    return score >= 80 ? 'text-emerald-400' : score >= 60 ? 'text-yellow-400' : 'text-slate-400';
  }

  /** Selected rows are tinted; rows touched by a live batch flash. */
  rowClass(id: string): string {
    const selected = this.isLeadSelected(id) ? 'bg-blue-900/10' : '';
    const flash = this.changedIds().has(id) ? 'lead-flash' : '';
    return `${selected} ${flash}`.trim();
  }

  selectLead(lead: Lead): void {
    this.store.dispatch(LeadsActions.selectLead({ id: lead.id }));
  }

  toggleLead(id: string): void {
    this.store.dispatch(LeadsActions.toggleLeadSelection({ id }));
  }

  toggleSelectAll(): void {
    if (this.isAllSelected()) {
      this.store.dispatch(LeadsActions.clearSelection());
    } else {
      this.store.dispatch(LeadsActions.selectAll());
    }
  }

  refreshLead(id: string): void {
    this.store.dispatch(LeadsActions.refreshLeadScraping({ id }));
  }

  changeStage(lead: Lead, stage: PipelineStage): void {
    if (stage === lead.stage) return;
    this.store.dispatch(LeadsActions.updateLead({ lead: { ...lead, stage }, previous: lead }));
  }

  isLeadSelected(id: string): boolean {
    const { mode, ids } = this.selection();
    return mode === 'exclude' ? !ids.includes(id) : ids.includes(id);
  }

  private toggled<T>(current: readonly T[], value: T): T[] {
    return current.includes(value) ? current.filter(v => v !== value) : [...current, value];
  }

  private patchFilter(filter: Partial<LeadFilter>): void {
    this.store.dispatch(LeadsActions.setFilter({ filter }));
  }

  isIndustrySelected(ind: string): boolean {
    return this.filter().industries.includes(ind);
  }

  toggleIndustry(ind: string): void {
    this.patchFilter({ industries: this.toggled(this.filter().industries, ind) });
  }

  isRegionSelected(region: string): boolean {
    return this.filter().regions.includes(region);
  }

  toggleRegion(region: string): void {
    this.patchFilter({ regions: this.toggled(this.filter().regions, region) });
  }

  isSizeSelected(size: CompanySize): boolean {
    return this.filter().companySizes.includes(size);
  }

  toggleSize(size: CompanySize): void {
    this.patchFilter({ companySizes: this.toggled(this.filter().companySizes, size) });
  }

  isStageSelected(st: PipelineStage): boolean {
    return this.filter().stages.includes(st);
  }

  toggleStage(st: PipelineStage): void {
    this.patchFilter({ stages: this.toggled(this.filter().stages, st) });
  }

  onScoreMinChange(value: number): void {
    this.patchFilter({ scoreMin: +value });
  }

  onScoreMaxChange(value: number): void {
    this.patchFilter({ scoreMax: +value });
  }

  readonly lastUpdate = computed(() => {
    const lead = this.selectedLead();
    return lead ? new Date(lead.updatedAt).toLocaleString() : '';
  });

  readonly detailItems = computed(() => {
    const lead = this.selectedLead();
    if (!lead) return [];
    const { company } = lead;
    return [
      { label: 'Industry', value: company.industry ?? 'N/A' },
      { label: 'Region', value: company.region ?? 'N/A' },
      { label: 'Company Size', value: company.size ?? 'N/A' },
      { label: 'Version (seq)', value: String(lead.seq) },
    ];
  });
}
