import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

type BadgeType = 'lead' | 'scraping' | 'job' | 'company';

const LEAD_CLASSES: Record<string, string> = {
  new: 'bg-blue-500/15 text-blue-400 border-blue-500/30',
  contacted: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30',
  qualified: 'bg-purple-500/15 text-purple-400 border-purple-500/30',
  proposal: 'bg-orange-500/15 text-orange-400 border-orange-500/30',
  won: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  lost: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const SCRAPING_CLASSES: Record<string, string> = {
  updated: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  stale: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  validating: 'bg-yellow-500/15 text-yellow-400 border-yellow-500/30 animate-pulse',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
};

const JOB_CLASSES: Record<string, string> = {
  queued: 'bg-slate-500/15 text-slate-400 border-slate-500/30',
  running: 'bg-blue-500/15 text-blue-400 border-blue-500/30 animate-pulse',
  completed: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
  failed: 'bg-red-500/15 text-red-400 border-red-500/30',
  cancelled: 'bg-slate-600/15 text-slate-500 border-slate-600/30',
};

const COMPANY_CLASSES: Record<string, string> = {
  startup: 'bg-violet-500/15 text-violet-400 border-violet-500/30',
  smb: 'bg-sky-500/15 text-sky-400 border-sky-500/30',
  'mid-market': 'bg-amber-500/15 text-amber-400 border-amber-500/30',
  enterprise: 'bg-emerald-500/15 text-emerald-400 border-emerald-500/30',
};

@Component({
  selector: 'app-status-badge',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold border uppercase tracking-wider {{ cssClass }}">
      {{ value }}
    </span>
  `,
})
export class StatusBadgeComponent {
  @Input() value = '';
  @Input() type: BadgeType = 'lead';

  get cssClass(): string {
    const map = this.type === 'lead' ? LEAD_CLASSES
      : this.type === 'scraping' ? SCRAPING_CLASSES
      : this.type === 'job' ? JOB_CLASSES
      : COMPANY_CLASSES;
    return map[this.value] ?? 'bg-slate-700 text-slate-400 border-slate-600';
  }
}
