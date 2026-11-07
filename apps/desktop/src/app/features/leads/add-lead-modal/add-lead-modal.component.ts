import {
  Component, ChangeDetectionStrategy, inject, input, output, signal
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { PIPELINE_STAGES } from '@leads/shared';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { CompanySize, PipelineStage } from '../../../core/models/lead.model';
import { MockDataService } from '../../../core/services/mock-data.service';

const INPUT_CLASS =
  'w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors';

/** Adds a company to the list. Mock mode only (the API has no endpoint to create leads). */
@Component({
  selector: 'app-add-lead-modal',
  standalone: true,
  imports: [ReactiveFormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (isOpen()) {
      <div class="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
           (click)="onOverlayClick($event)">
        <div class="bg-slate-900 border border-slate-800 rounded-xl w-full max-w-2xl mx-4 max-h-[90vh] flex flex-col shadow-2xl"
             (click)="$event.stopPropagation()">

          <!-- Header -->
          <div class="flex items-center justify-between px-6 py-4 border-b border-slate-800 shrink-0">
            <div>
              <h2 class="text-base font-semibold text-white">Add Company</h2>
              <p class="text-xs text-slate-500 mt-0.5">Add a company to your pipeline</p>
            </div>
            <button (click)="close()"
                    class="text-slate-500 hover:text-white transition-colors text-xl leading-none cursor-pointer">
              ×
            </button>
          </div>

          <!-- Form body -->
          <form [formGroup]="form" (ngSubmit)="submit()" class="overflow-y-auto flex-1 px-6 py-5">
            <div class="grid grid-cols-2 gap-4">

              <!-- Name -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Company *</label>
                <input formControlName="name" type="text" placeholder="Acme Corp"
                       [class]="inputClass + (hasError('name') ? ' border-red-500' : ' border-slate-700')" />
                @if (hasError('name')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Domain -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Domain *</label>
                <input formControlName="domain" type="text" placeholder="acme.com"
                       [class]="inputClass + (hasError('domain') ? ' border-red-500' : ' border-slate-700')" />
                @if (hasError('domain')) {
                  <p class="text-xs text-red-400">Valid domain required (e.g. acme.com)</p>
                }
              </div>

              <!-- Industry -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Industry *</label>
                <select formControlName="industry"
                        [class]="inputClass + (hasError('industry') ? ' border-red-500' : ' border-slate-700')">
                  <option value="" disabled>Select industry</option>
                  @for (ind of industries; track ind) {
                    <option [value]="ind" class="bg-slate-800">{{ ind }}</option>
                  }
                </select>
                @if (hasError('industry')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Region -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Region *</label>
                <select formControlName="region"
                        [class]="inputClass + (hasError('region') ? ' border-red-500' : ' border-slate-700')">
                  <option value="" disabled>Select region</option>
                  @for (region of regions; track region) {
                    <option [value]="region" class="bg-slate-800">{{ region }}</option>
                  }
                </select>
                @if (hasError('region')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Company size -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Company Size</label>
                <select formControlName="size" [class]="inputClass + ' border-slate-700'">
                  @for (size of companySizes; track size) {
                    <option [value]="size" class="bg-slate-800 capitalize">{{ size }}</option>
                  }
                </select>
              </div>

              <!-- Stage -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Stage</label>
                <select formControlName="stage" [class]="inputClass + ' border-slate-700'">
                  @for (st of stages; track st) {
                    <option [value]="st" class="bg-slate-800 capitalize">{{ st }}</option>
                  }
                </select>
              </div>
            </div>
          </form>

          <!-- Footer -->
          <div class="flex items-center justify-end gap-3 px-6 py-4 border-t border-slate-800 shrink-0">
            <button type="button" (click)="close()"
                    class="px-4 py-2 text-sm text-slate-400 hover:text-white border border-slate-700 hover:border-slate-600 rounded-lg transition-colors cursor-pointer">
              Cancel
            </button>
            <button type="button" (click)="submit()"
                    [disabled]="submitting()"
                    class="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white rounded-lg transition-colors cursor-pointer flex items-center gap-2 min-w-[110px] justify-center">
              @if (submitting()) {
                <span class="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin"></span>
                Saving...
              } @else {
                + Add Company
              }
            </button>
          </div>
        </div>
      </div>
    }
  `,
})
export class AddLeadModalComponent {
  readonly isOpen = input<boolean>(false);
  readonly closed = output<void>();

  private store = inject(Store);
  private fb = inject(FormBuilder);
  private mockData = inject(MockDataService);

  readonly inputClass = INPUT_CLASS;
  readonly submitting = signal(false);

  readonly industries = this.mockData.getIndustries();
  readonly regions = this.mockData.getRegions();
  readonly companySizes: CompanySize[] = ['startup', 'smb', 'mid-market', 'enterprise'];
  readonly stages: readonly PipelineStage[] = PIPELINE_STAGES;

  readonly form = this.fb.nonNullable.group({
    name: ['', Validators.required],
    domain: ['', [Validators.required, Validators.pattern(/^[a-z0-9]([a-z0-9-]*[a-z0-9])?(\.[a-z0-9]([a-z0-9-]*[a-z0-9])?)+$/i)]],
    industry: ['', Validators.required],
    region: ['', Validators.required],
    size: ['startup' as CompanySize],
    stage: ['new' as PipelineStage],
  });

  hasError(field: string): boolean {
    const ctrl = this.form.get(field);
    return !!(ctrl?.invalid && ctrl?.touched);
  }

  submit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      return;
    }

    this.submitting.set(true);
    const v = this.form.getRawValue();

    const lead = this.mockData.createLead({
      name: v.name.trim(),
      domain: v.domain.trim().toLowerCase(),
      industry: v.industry,
      region: v.region,
      size: v.size,
      stage: v.stage,
    });

    setTimeout(() => {
      this.store.dispatch(LeadsActions.addLead({ lead }));
      this.submitting.set(false);
      this.form.reset({ size: 'startup', stage: 'new' });
      this.closed.emit();
    }, 500);
  }

  close(): void {
    this.closed.emit();
  }

  onOverlayClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      this.close();
    }
  }
}
