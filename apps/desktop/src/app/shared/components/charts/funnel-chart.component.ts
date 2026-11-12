import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { barPercents } from './chart-geometry';

export interface FunnelStep {
  label: string;
  count: number;
  /** Percentage of the previous step; `null` for the first step. */
  conversion: number | null;
}

/** Centered CSS funnel. An ordered list, so the order and values read naturally. */
@Component({
  selector: 'app-funnel-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol class="m-0 p-0 list-none space-y-2" [attr.aria-label]="ariaLabel()">
      @for (row of rows(); track row.label) {
        <li class="flex items-center gap-3">
          <span class="text-xs text-slate-300 w-24 shrink-0 capitalize">{{ row.label }}</span>
          <span class="flex-1 flex justify-center" aria-hidden="true">
            <span
              class="block h-7 rounded bg-blue-500/80 transition-all duration-500"
              [style.width.%]="row.percent"
            ></span>
          </span>
          <span class="text-xs font-mono text-slate-200 w-14 text-right shrink-0">{{
            row.count
          }}</span>
          <span class="text-[10px] text-slate-500 w-16 shrink-0">
            @if (row.conversion !== null) {
              {{ row.conversion }}% of prev.
            }
          </span>
        </li>
      }
    </ol>
  `,
})
export class FunnelChartComponent {
  readonly steps = input.required<readonly FunnelStep[]>();
  readonly ariaLabel = input('Funnel');

  readonly rows = computed(() => {
    const steps = this.steps();
    const percents = barPercents(steps.map((s) => s.count));
    return steps.map((s, i) => ({ ...s, percent: percents[i] }));
  });
}
