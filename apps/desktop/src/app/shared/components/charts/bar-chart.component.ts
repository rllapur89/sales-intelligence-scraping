import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ChartDatum, barRects, labelIndexes, niceCeil, ticks } from './chart-geometry';

const WIDTH = 300;
const HEIGHT = 120;
const GAP = 2;
const MAX_LABELS = 6;

/** Vertical bar chart in plain SVG. The visible table of the report is the textual fallback. */
@Component({
  selector: 'app-bar-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="m-0">
      <svg
        role="img"
        [attr.aria-label]="ariaLabel()"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        class="w-full h-44"
        preserveAspectRatio="none"
      >
        <title>{{ ariaLabel() }}</title>
        @for (tick of axis(); track tick) {
          <line
            x1="0"
            [attr.y1]="height - (tick / max()) * height"
            [attr.x2]="width"
            [attr.y2]="height - (tick / max()) * height"
            stroke="#334155"
            stroke-width="0.5"
          />
        }
        @for (bar of bars(); track $index) {
          <rect
            [attr.x]="bar.rect.x"
            [attr.y]="bar.rect.y"
            [attr.width]="bar.rect.width"
            [attr.height]="bar.rect.height"
            fill="#3b82f6"
            rx="1"
          >
            <title>{{ bar.label }}: {{ bar.value }}</title>
          </rect>
        }
      </svg>
      <div class="flex justify-between text-[10px] text-slate-500 mt-1" aria-hidden="true">
        @for (label of xLabels(); track $index) {
          <span>{{ label }}</span>
        }
      </div>
    </figure>
  `,
})
export class BarChartComponent {
  readonly data = input.required<readonly ChartDatum[]>();
  readonly ariaLabel = input('Bar chart');

  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected readonly max = computed(() =>
    niceCeil(Math.max(0, ...this.data().map((d) => d.value))),
  );
  protected readonly axis = computed(() => ticks(this.max()).slice(1));
  readonly bars = computed(() => {
    const data = this.data();
    const rects = barRects(
      data.map((d) => d.value),
      WIDTH,
      HEIGHT,
      GAP,
      this.max(),
    );
    return data.map((d, i) => ({ label: d.label, value: d.value, rect: rects[i] }));
  });
  readonly xLabels = computed(() => {
    const data = this.data();
    return labelIndexes(data.length, MAX_LABELS).map((i) => data[i].label);
  });
}
