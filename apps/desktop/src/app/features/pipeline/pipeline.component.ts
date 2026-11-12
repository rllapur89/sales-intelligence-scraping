import {
  Component, ChangeDetectionStrategy, inject, signal, computed
} from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs/operators';
import { selectFilteredLeads } from '../../core/store/leads/leads.selectors';
import { LeadsActions } from '../../core/store/leads/leads.actions';
import { Lead, PipelineStage } from '../../core/models/lead.model';
import { DecimalPipe } from '@angular/common';
import { CrmDataSource } from '../../core/data/crm.data-source';
import { assigneeInitial, assigneeLabel } from '../../core/crm/crm-view';

const STAGES: { key: PipelineStage; label: string; color: string; icon: string }[] = [
  { key: 'new', label: 'New Lead', color: 'border-blue-500/40 bg-blue-500/5', icon: '🌱' },
  { key: 'contacted', label: 'Contacted', color: 'border-yellow-500/40 bg-yellow-500/5', icon: '📬' },
  { key: 'qualified', label: 'Qualified', color: 'border-purple-500/40 bg-purple-500/5', icon: '⭐' },
  { key: 'proposal', label: 'Proposal', color: 'border-orange-500/40 bg-orange-500/5', icon: '📄' },
  { key: 'won', label: 'Won', color: 'border-emerald-500/40 bg-emerald-500/5', icon: '🎯' },
];

@Component({
  selector: 'app-pipeline',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col h-full overflow-hidden">
      <!-- Header -->
      <div class="px-6 py-4 border-b border-slate-800 shrink-0 flex items-center justify-between bg-slate-900">
        <div>
          <h1 class="text-xl font-bold text-white">Pipeline</h1>
          <p class="text-sm text-slate-400 mt-0.5">{{ totalLeads() | number }} leads across {{ stages.length }} stages</p>
        </div>
      </div>

      <!-- Kanban board -->
      <div class="flex gap-4 p-4 overflow-x-auto flex-1">
        @for (stage of stages; track stage.key) {
          <div class="flex flex-col shrink-0 w-64 rounded-xl border {{ stage.color }} overflow-hidden">

            <!-- Column header -->
            <div class="px-3 py-3 flex items-center justify-between border-b border-slate-700/50">
              <div class="flex items-center gap-2">
                <span>{{ stage.icon }}</span>
                <span class="text-sm font-semibold text-white">{{ stage.label }}</span>
              </div>
              <div class="flex items-center gap-2">
                <span class="text-xs bg-slate-700 text-slate-300 px-2 py-0.5 rounded-full font-mono">
                  {{ leadsFor(stage.key).length }}
                </span>
              </div>
            </div>

            <!-- Lead cards -->
            <div class="flex-1 overflow-y-auto p-2 space-y-2 max-h-[calc(100vh-280px)]">
              @for (lead of leadsFor(stage.key).slice(0, 20); track lead.id) {
                <div (click)="selectLead(lead)"
                     (mouseenter)="hoveredId.set(lead.id)"
                     (mouseleave)="hoveredId.set(null)"
                     class="bg-slate-800 hover:bg-slate-750 border border-slate-700/50 hover:border-slate-600 rounded-lg p-3 cursor-pointer transition-all"
                     [class]="hoveredId() === lead.id ? 'shadow-lg scale-[1.01]' : ''">

                  <!-- Lead header -->
                  <div class="flex items-start gap-2 mb-2">
                    <div class="w-7 h-7 rounded-full bg-gradient-to-br from-slate-600 to-slate-700 flex items-center justify-center text-[10px] font-bold text-white shrink-0">
                      {{ lead.company.name.charAt(0).toUpperCase() }}
                    </div>
                    <div class="min-w-0 flex-1">
                      <div class="text-xs font-semibold text-white truncate">{{ lead.company.name }}</div>
                      <div class="text-[10px] text-blue-400 truncate">{{ lead.company.domain }}</div>
                    </div>
                    @if (assigneeBadge(lead); as badge) {
                      <span class="w-5 h-5 rounded-full bg-indigo-500/30 text-indigo-200 text-[10px] font-bold flex items-center justify-center shrink-0"
                            role="img" data-testid="assignee-badge"
                            [attr.aria-label]="badge.label" [attr.title]="badge.label">{{ badge.initial }}</span>
                    }
                    <!-- Score pill -->
                    <span class="text-[10px] font-bold px-1.5 py-0.5 rounded shrink-0"
                          [class]="lead.score >= 80 ? 'bg-emerald-500/20 text-emerald-400' : lead.score >= 60 ? 'bg-yellow-500/20 text-yellow-400' : 'bg-slate-700 text-slate-400'">
                      {{ lead.score }}
                    </span>
                  </div>

                  <!-- Footer -->
                  <div class="flex items-center justify-between">
                    <span class="text-[10px] text-slate-500 truncate">{{ lead.company.industry ?? '—' }}</span>
                    <span class="text-[10px] font-mono text-slate-400">{{ lead.signalCount }} signals</span>
                  </div>

                  <!-- Move stage buttons (on hover) -->
                  @if (hoveredId() === lead.id) {
                    <div class="flex gap-1 mt-2 pt-2 border-t border-slate-700/50">
                      @if (stage.key !== 'new') {
                        <button (click)="$event.stopPropagation(); moveStage(lead, 'prev')"
                                class="flex-1 py-0.5 text-[9px] border border-slate-600 text-slate-400 hover:text-white rounded transition-colors">
                          ← Back
                        </button>
                      }
                      @if (stage.key !== 'won') {
                        <button (click)="$event.stopPropagation(); moveStage(lead, 'next')"
                                class="flex-1 py-0.5 text-[9px] bg-blue-600/30 border border-blue-500/30 text-blue-400 hover:bg-blue-600/50 rounded transition-colors">
                          Next →
                        </button>
                      }
                    </div>
                  }
                </div>
              }

              @if (leadsFor(stage.key).length > 20) {
                <div class="text-center py-2 text-[10px] text-slate-500">
                  + {{ leadsFor(stage.key).length - 20 }} more leads
                </div>
              }

              @if (leadsFor(stage.key).length === 0) {
                <div class="text-center py-8 text-slate-600 text-xs">
                  No leads in this stage
                </div>
              }
            </div>
          </div>
        }
      </div>
    </div>
  `,
})
export class PipelineComponent {
  private store = inject(Store);
  readonly stages = STAGES;
  readonly hoveredId = signal<string | null>(null);
  private readonly me = inject(CrmDataSource).currentUser();

  readonly allLeads = toSignal(this.store.select(selectFilteredLeads), { initialValue: [] as Lead[] });

  readonly totalLeads = computed(() => this.allLeads().length);

  /** One pass over the leads instead of one filter per stage and change-detection run. */
  private readonly byStage = computed(() => {
    const groups = new Map<PipelineStage, Lead[]>();
    for (const lead of this.allLeads()) {
      const list = groups.get(lead.stage);
      if (list) list.push(lead);
      else groups.set(lead.stage, [lead]);
    }
    return groups;
  });

  leadsFor(stage: PipelineStage): Lead[] {
    return this.byStage().get(stage) ?? [];
  }

  /** Owner initial for the card; null for unassigned leads. */
  assigneeBadge(lead: Lead): { initial: string; label: string } | null {
    const initial = assigneeInitial(lead.assigneeId, this.me);
    return initial ? { initial, label: assigneeLabel(lead.assigneeId, this.me.id) } : null;
  }

  selectLead(lead: Lead): void {
    this.store.dispatch(LeadsActions.selectLead({ id: lead.id }));
  }

  moveStage(lead: Lead, direction: 'next' | 'prev'): void {
    const stageKeys = STAGES.map(s => s.key);
    const currentIdx = stageKeys.indexOf(lead.stage);
    const newIdx = direction === 'next' ? currentIdx + 1 : currentIdx - 1;
    if (newIdx < 0 || newIdx >= stageKeys.length) return;
    const updatedLead: Lead = { ...lead, stage: stageKeys[newIdx] };
    this.store.dispatch(LeadsActions.updateLead({ lead: updatedLead, previous: lead }));
  }
}
