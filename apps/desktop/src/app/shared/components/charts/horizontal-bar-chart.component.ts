import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartDatum, barPercents } from './chart-geometry';

/** Horizontal CSS bars. A real list: labels and values are text, the bars are decoration. */
@Component({
  selector: 'app-horizontal-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul class="space-y-2 m-0 p-0 list-none" [attr.aria-label]="ariaLabel()">
      @for (row of rows(); track row.label) {
        <li class="flex items-center gap-3">
          <span class="text-xs text-slate-300 w-32 truncate shrink-0" [title]="row.label">{{
            row.label
          }}</span>
          <span class="flex-1 h-5 bg-slate-700 rounded overflow-hidden" aria-hidden="true">
            <span
              class="block h-full rounded bg-blue-500 transition-all duration-500"
              [style.width.%]="row.percent"
            ></span>
          </span>
          <span class="text-xs font-mono text-slate-200 w-12 text-right shrink-0">{{
            row.value
          }}</span>
          @if (row.detail) {
            <span class="text-[10px] text-slate-500 w-24 shrink-0">{{ row.detail }}</span>
          }
        </li>
      }
    </ul>
  `,
})
export class HorizontalBarChartComponent {
  readonly data = input.required<readonly ChartDatum[]>();
  readonly ariaLabel = input('Bar chart');

  readonly rows = computed(() => {
    const data = this.data();
    const percents = barPercents(data.map((d) => d.value));
    return data.map((d, i) => ({ ...d, percent: percents[i] }));
  });
}
