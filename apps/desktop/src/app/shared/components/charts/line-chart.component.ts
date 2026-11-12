import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import {
  ChartDatum,
  labelIndexes,
  linePoints,
  niceCeil,
  ticks,
  toAreaPath,
  toLinePath,
} from './chart-geometry';

const WIDTH = 300;
const HEIGHT = 100;
const MAX_LABELS = 5;
/** Individual point markers get crowded on long ranges. */
const MAX_MARKERS = 31;

/** Line/area chart in plain SVG; every point has a `<title>` tooltip. */
@Component({
  selector: 'app-line-chart',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="m-0">
      <svg
        role="img"
        [attr.aria-label]="ariaLabel()"
        [attr.viewBox]="'0 0 ' + width + ' ' + height"
        class="w-full h-48"
        preserveAspectRatio="none"
      >
        <title>{{ ariaLabel() }}</title>
        <defs>
          <linearGradient [attr.id]="gradientId" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3b82f6" stop-opacity="0.5" />
            <stop offset="100%" stop-color="#3b82f6" stop-opacity="0" />
          </linearGradient>
        </defs>
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
        <path [attr.d]="geometry().area" [attr.fill]="'url(#' + gradientId + ')'" />
        <path
          [attr.d]="geometry().line"
          fill="none"
          stroke="#3b82f6"
          stroke-width="1.5"
          stroke-linejoin="round"
          stroke-linecap="round"
          vector-effect="non-scaling-stroke"
        />
        @if (showMarkers()) {
          @for (point of markers(); track $index) {
            <circle [attr.cx]="point.x" [attr.cy]="point.y" r="1.6" fill="#93c5fd">
              <title>{{ point.label }}: {{ point.value }}</title>
            </circle>
          }
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
export class LineChartComponent {
  private static nextId = 0;

  readonly data = input.required<readonly ChartDatum[]>();
  readonly ariaLabel = input('Line chart');

  protected readonly gradientId = `line-chart-grad-${LineChartComponent.nextId++}`;
  protected readonly width = WIDTH;
  protected readonly height = HEIGHT;

  protected readonly max = computed(() =>
    niceCeil(Math.max(0, ...this.data().map((d) => d.value))),
  );
  protected readonly axis = computed(() => ticks(this.max()).slice(1));
  readonly points = computed(() =>
    linePoints(
      this.data().map((d) => d.value),
      WIDTH,
      HEIGHT,
      this.max(),
    ),
  );
  readonly geometry = computed(() => ({
    line: toLinePath(this.points()),
    area: toAreaPath(this.points(), HEIGHT),
  }));
  protected readonly showMarkers = computed(() => this.data().length <= MAX_MARKERS);
  readonly markers = computed(() => {
    const data = this.data();
    return this.points().map((p, i) => ({ ...p, label: data[i].label, value: data[i].value }));
  });
  readonly xLabels = computed(() => {
    const data = this.data();
    return labelIndexes(data.length, MAX_LABELS).map((i) => data[i].label);
  });
}
