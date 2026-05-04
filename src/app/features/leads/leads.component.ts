import {
  Component, ChangeDetectionStrategy, inject, signal, computed, OnInit, OnDestroy
} from '@angular/core';
import { Store } from '@ngrx/store';
import { DecimalPipe } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { ScrollingModule } from '@angular/cdk/scrolling';
import { toSignal } from '@angular/core/rxjs-interop';

import { LeadsActions } from '../../core/store/leads/leads.actions';
import {
  selectFilteredLeads, selectLeadsLoading, selectSelectedLead,
  selectSelectedCount, selectHasSelection, selectIsAllSelected,
  selectLeadsFilter, selectFilteredCount, selectLeadsTotalCount, selectRescrapingIds
} from '../../core/store/leads/leads.selectors';
import { Lead, CompanySize, LeadStatus } from '../../core/models/lead.model';
import { StatusBadgeComponent } from '../../shared/components/status-badge/status-badge.component';
import { SkeletonComponent } from '../../shared/components/skeleton/skeleton.component';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';
import { RelativeTimePipe } from '../../shared/pipes/relative-time.pipe';
import { MockDataService } from '../../core/services/mock-data.service';
import { AddLeadModalComponent } from './add-lead-modal/add-lead-modal.component';

@Component({
  selector: 'app-leads',
  standalone: true,
  imports: [
    DecimalPipe, FormsModule,
    ScrollingModule, StatusBadgeComponent, SkeletonComponent,
    EmptyStateComponent, RelativeTimePipe, AddLeadModalComponent
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
            <div class="space-y-1.5">
              @for (ind of industries; track ind) {
                <label class="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer">
                  <input type="checkbox" [checked]="isIndustrySelected(ind)"
                         (change)="toggleIndustry(ind)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500 focus:ring-blue-500/30" />
                  <span>{{ ind }}</span>
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

          <!-- Status -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">Lead Status</label>
            <div class="space-y-1.5">
              @for (st of leadStatuses; track st) {
                <label class="flex items-center gap-2 text-sm text-slate-400 hover:text-white cursor-pointer">
                  <input type="checkbox" [checked]="isStatusSelected(st)"
                         (change)="toggleStatus(st)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500" />
                  <span class="capitalize">{{ st }}</span>
                </label>
              }
            </div>
          </div>

          <!-- Score range -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-2">
              Score: {{ filter()?.scoreMin ?? 0 }} – {{ filter()?.scoreMax ?? 100 }}
            </label>
            <div class="space-y-2">
              <input type="range" min="0" max="100"
                     [ngModel]="filter()?.scoreMin ?? 0"
                     (ngModelChange)="onScoreMinChange($event)"
                     class="w-full accent-blue-500" />
              <input type="range" min="0" max="100"
                     [ngModel]="filter()?.scoreMax ?? 100"
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
              <button class="text-xs text-blue-400 hover:text-white transition-colors cursor-pointer">🏷️ Tag</button>
              <button class="text-xs text-red-400 hover:text-red-300 transition-colors cursor-pointer">🗑️ Delete</button>
            </div>
          }

          <div class="ml-auto flex items-center gap-2">
            <button (click)="showFilters.update(v => !v)"
                    class="lg:hidden px-3 py-1.5 text-xs text-slate-400 hover:text-white border border-slate-700 rounded-lg cursor-pointer">
              🔧 Filters
            </button>
            <button (click)="showAddLeadModal.set(true)"
                    class="px-3 py-1.5 text-xs bg-blue-600 hover:bg-blue-500 text-white rounded-lg transition-colors cursor-pointer">
              + Add Lead
            </button>
          </div>
        </div>

        <!-- Table header -->
        <div class="grid grid-cols-[32px_1fr_1fr_120px_80px_110px_90px_80px] gap-2 px-4 py-2 text-[10px] text-slate-500 font-semibold uppercase tracking-wider border-b border-slate-800 bg-slate-900 shrink-0">
          <div></div>
          <div>Name / Company</div>
          <div>Role</div>
          <div>Industry</div>
          <div class="text-center">Score</div>
          <div>Status</div>
          <div>Scraped</div>
          <div>Value</div>
        </div>

        <!-- Virtual scroll viewport — O(1) rendering de 1200+ leads -->
        @if (loading()) {
          <app-skeleton [count]="12" />
        } @else if (filteredLeads().length === 0) {
          <app-empty-state
            icon="🔍"
            title="No leads match your filters"
            message="Try adjusting the industry, status, or score filters to see more results."
            actionLabel="Reset Filters"
            (action)="store.dispatch(actions.resetFilter())"
          />
        } @else {
          <cdk-virtual-scroll-viewport itemSize="56" class="flex-1 overflow-auto">
            <div *cdkVirtualFor="let lead of filteredLeads(); trackBy: trackByLeadId"
                 class="grid grid-cols-[32px_1fr_1fr_120px_80px_110px_90px_80px] gap-2 px-4 items-center border-b border-slate-800/60 hover:bg-slate-800/50 cursor-pointer transition-colors group"
                 style="height: 56px"
                 [class]="isLeadSelected(lead.id) ? 'bg-blue-900/10' : ''"
                 (click)="selectLead(lead)">

              <!-- Checkbox -->
              <div (click)="$event.stopPropagation()">
                <input type="checkbox"
                       [checked]="isLeadSelected(lead.id)"
                       (change)="toggleLead(lead.id)"
                       class="rounded border-slate-600 bg-slate-800 text-blue-500" />
              </div>

              <!-- Name + Company -->
              <div class="flex items-center gap-2 min-w-0">
                <div class="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-[11px] font-bold text-white shrink-0">
                  {{ lead.firstName[0] }}{{ lead.lastName[0] }}
                </div>
                <div class="min-w-0">
                  <div class="text-sm font-medium text-slate-200 truncate">{{ lead.firstName }} {{ lead.lastName }}</div>
                  <div class="text-[11px] text-slate-500 truncate">{{ lead.company }}</div>
                </div>
              </div>

              <!-- Role -->
              <div class="text-xs text-slate-400 truncate">{{ lead.role }}</div>

              <!-- Industry -->
              <div class="text-xs text-slate-500 truncate">{{ lead.industry }}</div>

              <!-- Score -->
              <div class="text-center">
                <span class="text-sm font-bold font-mono"
                      [class]="lead.score >= 80 ? 'text-emerald-400' : lead.score >= 60 ? 'text-yellow-400' : 'text-slate-400'">
                  {{ lead.score }}
                </span>
              </div>

              <!-- Status -->
              <div><app-status-badge [value]="lead.status" type="lead" /></div>

              <!-- Last scraped -->
              <div class="text-[11px] text-slate-500">{{ lead.lastScraped | relativeTime }}</div>

              <!-- Est. Value -->
              <div class="text-[11px] text-slate-400 font-mono">
                {{ '$' + (lead.estimatedValue / 1000).toFixed(0) + 'k' }}
              </div>
            </div>
          </cdk-virtual-scroll-viewport>
        }
      </div>

      <!-- Detail sidebar -->
      @if (selectedLead()) {
        <aside class="w-80 shrink-0 border-l border-slate-800 bg-slate-900 overflow-y-auto flex flex-col">
          <div class="p-4 border-b border-slate-800 flex items-center justify-between">
            <h3 class="text-sm font-semibold text-white">Lead Detail</h3>
            <button (click)="store.dispatch(actions.deselectLead({ id: selectedLead()?.id ?? '' }))"
                    class="text-slate-500 hover:text-white transition-colors text-lg cursor-pointer">×</button>
          </div>

          <div class="p-4 space-y-5">
            <!-- Avatar + name -->
            <div class="flex items-center gap-3">
              <div class="w-12 h-12 rounded-full bg-gradient-to-br from-blue-500 to-purple-600 flex items-center justify-center text-lg font-bold text-white">
                {{ selectedLead()!.firstName[0] }}{{ selectedLead()!.lastName[0] }}
              </div>
              <div>
                <div class="font-semibold text-white">{{ selectedLead()!.firstName }} {{ selectedLead()!.lastName }}</div>
                <div class="text-sm text-slate-400">{{ selectedLead()!.role }}</div>
                <div class="text-sm text-blue-400">{{ selectedLead()!.company }}</div>
              </div>
            </div>

            <!-- Score bar -->
            <div>
              <div class="flex justify-between text-xs mb-1">
                <span class="text-slate-400">Lead Score</span>
                <span class="font-bold font-mono"
                      [class]="selectedLead()!.score >= 80 ? 'text-emerald-400' : selectedLead()!.score >= 60 ? 'text-yellow-400' : 'text-slate-400'">
                  {{ selectedLead()!.score }}/100
                </span>
              </div>
              <div class="h-2 bg-slate-700 rounded-full overflow-hidden">
                <div class="h-full rounded-full transition-all"
                     [style.width]="selectedLead()!.score + '%'"
                     [class]="selectedLead()!.score >= 80 ? 'bg-emerald-500' : selectedLead()!.score >= 60 ? 'bg-yellow-500' : 'bg-slate-500'">
                </div>
              </div>
            </div>

            <!-- Details grid -->
            <div class="space-y-2 text-sm">
              @for (item of detailItems(); track item.label) {
                <div class="flex justify-between py-1.5 border-b border-slate-800">
                  <span class="text-slate-500">{{ item.label }}</span>
                  <span class="text-slate-300 text-right max-w-[160px] truncate">{{ item.value }}</span>
                </div>
              }
            </div>

            <!-- Tech stack -->
            @if (selectedLead()!.techStack?.length) {
              <div>
                <div class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2">Tech Stack</div>
                <div class="flex flex-wrap gap-1.5">
                  @for (tech of selectedLead()!.techStack; track tech) {
                    <span class="px-2 py-0.5 bg-slate-700 text-slate-300 text-[11px] rounded">{{ tech }}</span>
                  }
                </div>
              </div>
            }

            <!-- Actions -->
            <div class="space-y-2 pt-2">
              <button (click)="refreshLead(selectedLead()!.id)"
                      [disabled]="rescrapingIds().has(selectedLead()!.id)"
                      class="w-full py-2 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white text-sm rounded-lg transition-colors cursor-pointer flex items-center justify-center gap-2">
                @if (rescrapingIds().has(selectedLead()!.id)) {
                  <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                  Scraping...
                } @else {
                  🔄 Re-scrape Lead
                }
              </button>
              <button class="w-full py-2 border border-slate-700 hover:border-slate-600 text-slate-300 text-sm rounded-lg transition-colors cursor-pointer">
                📧 Send to Campaign
              </button>
            </div>
          </div>
        </aside>
      }
    </div>

    <app-add-lead-modal
      [isOpen]="showAddLeadModal()"
      (closed)="showAddLeadModal.set(false)"
    />
  `,
})
export class LeadsComponent implements OnInit {
  readonly store = inject(Store);
  readonly actions = LeadsActions;
  private mockData = inject(MockDataService);

  readonly showFilters = signal(false);
  readonly showAddLeadModal = signal(false);

  readonly loading = toSignal(this.store.select(selectLeadsLoading), { initialValue: false });
  readonly filteredLeads = toSignal(this.store.select(selectFilteredLeads), { initialValue: [] });
  readonly selectedLead = toSignal(this.store.select(selectSelectedLead), { initialValue: null });
  readonly rescrapingIds = toSignal(this.store.select(selectRescrapingIds), { initialValue: new Set<string>() });
  readonly selectedCount = toSignal(this.store.select(selectSelectedCount), { initialValue: 0 });
  readonly hasSelection = toSignal(this.store.select(selectHasSelection), { initialValue: false });
  readonly isAllSelected = toSignal(this.store.select(selectIsAllSelected), { initialValue: false });
  readonly filter = toSignal(this.store.select(selectLeadsFilter), { initialValue: null as any });
  readonly filteredCount = toSignal(this.store.select(selectFilteredCount), { initialValue: 0 });
  readonly totalCount = toSignal(this.store.select(selectLeadsTotalCount), { initialValue: 0 });

  // Selección local (simplificada — el estado real está en el store)
  private selectedIds = signal<Set<string>>(new Set());
  private selectionMode = signal<'include' | 'exclude'>('include');

  readonly industries = this.mockData.getIndustries();
  readonly companySizes: CompanySize[] = ['startup', 'smb', 'mid-market', 'enterprise'];
  readonly leadStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

  ngOnInit(): void {}

  trackByLeadId(_: number, lead: Lead): string { return lead.id; }

  selectLead(lead: Lead): void {
    this.store.dispatch(LeadsActions.selectLead({ id: lead.id }));
  }

  toggleLead(id: string): void {
    const current = this.store.select(selectIsAllSelected);
    // Implementación del patrón invertido — el store maneja el estado
    this.store.dispatch(LeadsActions.selectLead({ id }));
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

  isLeadSelected(id: string): boolean {
    return this.selectedIds().has(id);
  }

  isIndustrySelected(ind: string): boolean {
    return this.filter()?.industries?.includes(ind) ?? false;
  }

  toggleIndustry(ind: string): void {
    const current = this.filter()?.industries ?? [];
    const industries = current.includes(ind)
      ? current.filter((i: string) => i !== ind)
      : [...current, ind];
    this.store.dispatch(LeadsActions.setFilter({ filter: { industries } }));
  }

  isSizeSelected(size: CompanySize): boolean {
    return this.filter()?.companySizes?.includes(size) ?? false;
  }

  toggleSize(size: CompanySize): void {
    const current = this.filter()?.companySizes ?? [];
    const companySizes: CompanySize[] = current.includes(size)
      ? current.filter((s: CompanySize) => s !== size)
      : [...current, size];
    this.store.dispatch(LeadsActions.setFilter({ filter: { companySizes } }));
  }

  isStatusSelected(st: LeadStatus): boolean {
    return this.filter()?.statuses?.includes(st) ?? false;
  }

  toggleStatus(st: LeadStatus): void {
    const current = this.filter()?.statuses ?? [];
    const statuses: LeadStatus[] = current.includes(st)
      ? current.filter((s: LeadStatus) => s !== st)
      : [...current, st];
    this.store.dispatch(LeadsActions.setFilter({ filter: { statuses } }));
  }

  onScoreMinChange(value: number): void {
    this.store.dispatch(LeadsActions.setFilter({ filter: { scoreMin: +value } }));
  }

  onScoreMaxChange(value: number): void {
    this.store.dispatch(LeadsActions.setFilter({ filter: { scoreMax: +value } }));
  }

  readonly detailItems = computed(() => {
    const lead = this.selectedLead();
    if (!lead) return [];
    return [
      { label: 'Email', value: lead.email },
      { label: 'Phone', value: lead.phone ?? 'N/A' },
      { label: 'Industry', value: lead.industry },
      { label: 'Country', value: lead.country },
      { label: 'Company Size', value: lead.companySize },
      { label: 'Seniority', value: lead.seniority },
      { label: 'Est. Value', value: '$' + lead.estimatedValue.toLocaleString() },
      { label: 'Assigned To', value: lead.assignedTo ?? 'Unassigned' },
      { label: 'Scraping Status', value: lead.scrapingStatus },
      { label: 'Last Scraped', value: lead.lastScraped.toLocaleDateString() },
    ];
  });
}
