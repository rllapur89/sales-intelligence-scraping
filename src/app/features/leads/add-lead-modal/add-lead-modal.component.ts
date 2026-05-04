import {
  Component, ChangeDetectionStrategy, inject, input, output, signal
} from '@angular/core';
import { ReactiveFormsModule, FormBuilder, Validators } from '@angular/forms';
import { Store } from '@ngrx/store';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { Lead, CompanySize, LeadStatus } from '../../../core/models/lead.model';
import { MockDataService } from '../../../core/services/mock-data.service';

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
              <h2 class="text-base font-semibold text-white">Add New Lead</h2>
              <p class="text-xs text-slate-500 mt-0.5">Fill in the details to add a lead to your pipeline</p>
            </div>
            <button (click)="close()"
                    class="text-slate-500 hover:text-white transition-colors text-xl leading-none cursor-pointer">
              ×
            </button>
          </div>

          <!-- Form body -->
          <form [formGroup]="form" (ngSubmit)="submit()" class="overflow-y-auto flex-1 px-6 py-5">
            <div class="grid grid-cols-2 gap-4">

              <!-- First name -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">First Name *</label>
                <input formControlName="firstName" type="text" placeholder="John"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('firstName')"
                       [class.border-red-500]="hasError('firstName')" />
                @if (hasError('firstName')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Last name -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Last Name *</label>
                <input formControlName="lastName" type="text" placeholder="Doe"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('lastName')"
                       [class.border-red-500]="hasError('lastName')" />
                @if (hasError('lastName')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Email -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Email *</label>
                <input formControlName="email" type="email" placeholder="john@company.com"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('email')"
                       [class.border-red-500]="hasError('email')" />
                @if (hasError('email')) {
                  <p class="text-xs text-red-400">Valid email required</p>
                }
              </div>

              <!-- Phone -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Phone</label>
                <input formControlName="phone" type="tel" placeholder="+1 555 000 0000"
                       class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors" />
              </div>

              <!-- Company -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Company *</label>
                <input formControlName="company" type="text" placeholder="Acme Corp"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('company')"
                       [class.border-red-500]="hasError('company')" />
                @if (hasError('company')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Role -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Role *</label>
                <input formControlName="role" type="text" placeholder="VP of Engineering"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('role')"
                       [class.border-red-500]="hasError('role')" />
                @if (hasError('role')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Industry -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Industry *</label>
                <select formControlName="industry"
                        class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors"
                        [class.border-slate-700]="!hasError('industry')"
                        [class.border-red-500]="hasError('industry')">
                  <option value="" disabled class="text-slate-600">Select industry</option>
                  @for (ind of industries; track ind) {
                    <option [value]="ind" class="bg-slate-800">{{ ind }}</option>
                  }
                </select>
                @if (hasError('industry')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Country -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Country *</label>
                <input formControlName="country" type="text" placeholder="United States"
                       class="w-full px-3 py-2 bg-slate-800 border rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors"
                       [class.border-slate-700]="!hasError('country')"
                       [class.border-red-500]="hasError('country')" />
                @if (hasError('country')) {
                  <p class="text-xs text-red-400">Required</p>
                }
              </div>

              <!-- Company size -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Company Size</label>
                <select formControlName="companySize"
                        class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
                  @for (size of companySizes; track size) {
                    <option [value]="size" class="bg-slate-800 capitalize">{{ size }}</option>
                  }
                </select>
              </div>

              <!-- Seniority -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Seniority</label>
                <select formControlName="seniority"
                        class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
                  @for (s of seniorities; track s) {
                    <option [value]="s" class="bg-slate-800 capitalize">{{ s }}</option>
                  }
                </select>
              </div>

              <!-- Status -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Status</label>
                <select formControlName="status"
                        class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 transition-colors">
                  @for (st of leadStatuses; track st) {
                    <option [value]="st" class="bg-slate-800 capitalize">{{ st }}</option>
                  }
                </select>
              </div>

              <!-- Estimated value -->
              <div class="space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Est. Value ($)</label>
                <input formControlName="estimatedValue" type="number" min="0" placeholder="5000"
                       class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors" />
              </div>

              <!-- Notes (full width) -->
              <div class="col-span-2 space-y-1.5">
                <label class="text-xs font-semibold text-slate-400 uppercase tracking-widest">Notes</label>
                <textarea formControlName="notes" rows="3" placeholder="Any relevant context about this lead..."
                          class="w-full px-3 py-2 bg-slate-800 border border-slate-700 rounded-lg text-sm text-slate-200 focus:outline-none focus:border-blue-500 placeholder:text-slate-600 transition-colors resize-none"></textarea>
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
                + Add Lead
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

  readonly submitting = signal(false);

  readonly industries = this.mockData.getIndustries();
  readonly companySizes: CompanySize[] = ['startup', 'smb', 'mid-market', 'enterprise'];
  readonly seniorities = ['c-level', 'vp', 'director', 'manager', 'individual'] as const;
  readonly leadStatuses: LeadStatus[] = ['new', 'contacted', 'qualified', 'proposal', 'won', 'lost'];

  readonly form = this.fb.group({
    firstName:      ['', Validators.required],
    lastName:       ['', Validators.required],
    email:          ['', [Validators.required, Validators.email]],
    phone:          [''],
    company:        ['', Validators.required],
    role:           ['', Validators.required],
    industry:       ['', Validators.required],
    country:        ['', Validators.required],
    companySize:    ['startup' as CompanySize],
    seniority:      ['manager'],
    status:         ['new' as LeadStatus],
    estimatedValue: [5000],
    notes:          [''],
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
    const v = this.form.value;

    const lead: Lead = {
      id: crypto.randomUUID(),
      firstName:      v.firstName!,
      lastName:       v.lastName!,
      email:          v.email!,
      phone:          v.phone || undefined,
      company:        v.company!,
      role:           v.role!,
      industry:       v.industry!,
      country:        v.country!,
      city:           '',
      companySize:    (v.companySize || 'startup') as CompanySize,
      seniority:      (v.seniority || 'manager') as Lead['seniority'],
      status:         (v.status || 'new') as LeadStatus,
      score:          Math.floor(Math.random() * 40) + 50,
      scrapingStatus: 'stale',
      estimatedValue: v.estimatedValue ?? 0,
      lastScraped:    new Date(),
      createdAt:      new Date(),
      tags:           [],
      notes:          v.notes || undefined,
    };

    setTimeout(() => {
      this.store.dispatch(LeadsActions.addLead({ lead }));
      this.submitting.set(false);
      this.form.reset({
        companySize: 'startup',
        seniority: 'manager',
        status: 'new',
        estimatedValue: 5000,
      });
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
