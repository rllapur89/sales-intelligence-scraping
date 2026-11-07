import {
  Component, ChangeDetectionStrategy, OnInit, inject, signal
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { SIGNAL_TYPES, type SignalType, type SubscriptionDto } from '@leads/shared';
import { SubscriptionsService, draftOf } from '../../core/services/subscriptions.service';
import { SubscriptionDraft } from '../../core/data/subscriptions.data-source';
import { EmptyStateComponent } from '../../shared/components/empty-state/empty-state.component';

export function emptyDraft(): SubscriptionDraft {
  return {
    name: '',
    active: true,
    filter: { industries: [], regions: [], signalTypes: [], minScore: 0 },
  };
}

/** Adds `value` (trimmed, case-insensitive unique) to a chip list. Pure. */
export function addChip(list: readonly string[], value: string): string[] {
  const chip = value.trim();
  if (!chip || list.some(c => c.toLowerCase() === chip.toLowerCase())) return [...list];
  return [...list, chip];
}

@Component({
  selector: 'app-subscriptions',
  standalone: true,
  imports: [FormsModule, EmptyStateComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="p-6 space-y-5 max-w-[1000px] mx-auto">
      <div class="flex items-center justify-between">
        <div>
          <h1 class="text-xl font-bold text-white">Subscriptions</h1>
          <p class="text-sm text-slate-400 mt-0.5">
            Only leads matching an active subscription are pushed to you live. Empty filters match everything.
          </p>
        </div>
        <button (click)="startCreate()"
                class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors cursor-pointer">
          + New subscription
        </button>
      </div>

      @if (service.error(); as error) {
        <div class="px-4 py-3 rounded-lg border border-red-500/30 bg-red-500/10 text-sm text-red-300">{{ error }}</div>
      }

      <!-- Form -->
      @if (draft(); as d) {
        <form class="bg-slate-800 border border-slate-700 rounded-xl p-5 space-y-4"
              (ngSubmit)="save()">
          <h2 class="text-sm font-semibold text-white">{{ editingId() ? 'Edit subscription' : 'New subscription' }}</h2>

          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5" for="sub-name">Name</label>
            <input id="sub-name" name="name" type="text" maxlength="100" required
                   [ngModel]="d.name" (ngModelChange)="patch({ name: $event })"
                   class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <!-- Industries -->
            <div>
              <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5" for="sub-industry">Industries</label>
              <div class="flex flex-wrap gap-1.5 mb-2">
                @for (chip of d.filter.industries; track chip) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-600/20 text-blue-300 text-xs">
                    {{ chip }}
                    <button type="button" [attr.aria-label]="'Remove ' + chip" (click)="removeChip('industries', chip)"
                            class="hover:text-white cursor-pointer">×</button>
                  </span>
                }
              </div>
              <input id="sub-industry" name="industry" type="text" placeholder="Type and press Enter"
                     [ngModel]="industryInput()" (ngModelChange)="industryInput.set($event)"
                     (keydown.enter)="$event.preventDefault(); commitChip('industries')"
                     (blur)="commitChip('industries')"
                     class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>

            <!-- Regions -->
            <div>
              <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5" for="sub-region">Regions</label>
              <div class="flex flex-wrap gap-1.5 mb-2">
                @for (chip of d.filter.regions; track chip) {
                  <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-600/20 text-emerald-300 text-xs">
                    {{ chip }}
                    <button type="button" [attr.aria-label]="'Remove ' + chip" (click)="removeChip('regions', chip)"
                            class="hover:text-white cursor-pointer">×</button>
                  </span>
                }
              </div>
              <input id="sub-region" name="region" type="text" placeholder="Type and press Enter"
                     [ngModel]="regionInput()" (ngModelChange)="regionInput.set($event)"
                     (keydown.enter)="$event.preventDefault(); commitChip('regions')"
                     (blur)="commitChip('regions')"
                     class="w-full bg-slate-900 border border-slate-700 rounded-lg px-3 py-2 text-sm text-slate-200 focus:outline-none focus:border-blue-500" />
            </div>
          </div>

          <!-- Signal types -->
          <fieldset>
            <legend class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-1.5">Signal types</legend>
            <div class="flex flex-wrap gap-4">
              @for (type of signalTypes; track type) {
                <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
                  <input type="checkbox" [checked]="d.filter.signalTypes.includes(type)"
                         (change)="toggleSignalType(type)"
                         class="rounded border-slate-600 bg-slate-800 text-blue-500" />
                  {{ type }}
                </label>
              }
            </div>
          </fieldset>

          <!-- Min score -->
          <div>
            <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest block mb-1.5" for="sub-score">
              Minimum score: <span class="text-white font-mono">{{ d.filter.minScore }}</span>
            </label>
            <input id="sub-score" name="minScore" type="range" min="0" max="100" step="1"
                   [ngModel]="d.filter.minScore" (ngModelChange)="patchFilter({ minScore: +$event })"
                   class="w-full accent-blue-500" />
          </div>

          <label class="flex items-center gap-2 text-sm text-slate-300 cursor-pointer">
            <input type="checkbox" [checked]="d.active" (change)="patch({ active: !d.active })"
                   class="rounded border-slate-600 bg-slate-800 text-blue-500" />
            Active
          </label>

          <div class="flex justify-end gap-3 pt-1">
            <button type="button" (click)="cancel()"
                    class="px-4 py-2 text-sm text-slate-300 border border-slate-700 hover:border-slate-600 rounded-lg cursor-pointer">Cancel</button>
            <button type="submit" [disabled]="!d.name.trim() || service.saving()"
                    class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white rounded-lg cursor-pointer">
              {{ service.saving() ? 'Saving...' : 'Save' }}
            </button>
          </div>
        </form>
      }

      <!-- List -->
      @if (service.loading()) {
        <div class="h-24 bg-slate-800 rounded-xl animate-pulse border border-slate-700"></div>
      } @else if (service.items().length === 0 && !draft()) {
        <app-empty-state
          icon="🔔"
          title="No subscriptions"
          message="Without an active subscription you receive no live leads."
          actionLabel="New subscription"
          (action)="startCreate()"
        />
      } @else {
        <div class="space-y-3">
          @for (sub of service.items(); track sub.id) {
            <div class="bg-slate-800 border border-slate-700 rounded-xl p-4 flex items-start justify-between gap-4"
                 [class.opacity-60]="!sub.active">
              <div class="min-w-0 space-y-1.5">
                <div class="flex items-center gap-2">
                  <span class="font-semibold text-white truncate">{{ sub.name }}</span>
                  <span class="text-[10px] font-bold px-1.5 py-0.5 rounded uppercase"
                        [class]="sub.active ? 'bg-emerald-500/20 text-emerald-400' : 'bg-slate-600/40 text-slate-400'">
                    {{ sub.active ? 'active' : 'paused' }}
                  </span>
                </div>
                <p class="text-xs text-slate-400">{{ summary(sub) }}</p>
              </div>
              <div class="flex items-center gap-2 shrink-0">
                <button (click)="service.toggleActive(sub)"
                        class="px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg cursor-pointer">
                  {{ sub.active ? 'Pause' : 'Activate' }}
                </button>
                <button (click)="startEdit(sub)"
                        class="px-3 py-1.5 text-xs border border-slate-700 hover:border-slate-600 text-slate-300 rounded-lg cursor-pointer">Edit</button>
                <button (click)="service.remove(sub)"
                        class="px-3 py-1.5 text-xs border border-red-500/30 hover:border-red-500/60 text-red-400 rounded-lg cursor-pointer">Delete</button>
              </div>
            </div>
          }
        </div>
      }
    </div>
  `,
})
export class SubscriptionsComponent implements OnInit {
  readonly service = inject(SubscriptionsService);

  readonly signalTypes = SIGNAL_TYPES;
  readonly draft = signal<SubscriptionDraft | null>(null);
  readonly editingId = signal<string | null>(null);
  readonly industryInput = signal('');
  readonly regionInput = signal('');

  ngOnInit(): void {
    this.service.load();
  }

  startCreate(): void {
    this.editingId.set(null);
    this.draft.set(emptyDraft());
  }

  startEdit(sub: SubscriptionDto): void {
    this.editingId.set(sub.id);
    this.draft.set(draftOf(sub));
  }

  cancel(): void {
    this.draft.set(null);
    this.editingId.set(null);
    this.industryInput.set('');
    this.regionInput.set('');
  }

  patch(changes: Partial<Pick<SubscriptionDraft, 'name' | 'active'>>): void {
    this.draft.update(d => (d ? { ...d, ...changes } : d));
  }

  patchFilter(changes: Partial<SubscriptionDraft['filter']>): void {
    this.draft.update(d => (d ? { ...d, filter: { ...d.filter, ...changes } } : d));
  }

  commitChip(field: 'industries' | 'regions'): void {
    const input = field === 'industries' ? this.industryInput : this.regionInput;
    const current = this.draft()?.filter[field] ?? [];
    this.patchFilter({ [field]: addChip(current, input()) });
    input.set('');
  }

  removeChip(field: 'industries' | 'regions', chip: string): void {
    const current = this.draft()?.filter[field] ?? [];
    this.patchFilter({ [field]: current.filter(c => c !== chip) });
  }

  toggleSignalType(type: SignalType): void {
    const current = this.draft()?.filter.signalTypes ?? [];
    this.patchFilter({
      signalTypes: current.includes(type) ? current.filter(t => t !== type) : [...current, type],
    });
  }

  save(): void {
    // Pick up a chip typed but not confirmed yet.
    this.commitChip('industries');
    this.commitChip('regions');
    const d = this.draft();
    if (!d || !d.name.trim()) return;
    this.service.save(this.editingId(), d, () => this.cancel());
  }

  summary(sub: SubscriptionDto): string {
    const f = sub.filter;
    const part = (label: string, values: readonly string[]) =>
      `${label}: ${values.length ? values.join(', ') : 'any'}`;
    return [
      part('Industries', f.industries),
      part('Regions', f.regions),
      part('Signals', f.signalTypes),
      `Min score: ${f.minScore}`,
    ].join(' · ');
  }
}
