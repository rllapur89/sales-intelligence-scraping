import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import type { ReportTable } from '../../core/analytics/report-tables';

/**
 * Frame of one report: title, export buttons, loading / error / empty states, the projected chart
 * and a collapsible table with the same numbers (the accessible fallback of the chart).
 */
@Component({
  selector: 'app-report-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="bg-slate-800 border border-slate-700 rounded-xl p-5"
      [attr.aria-busy]="status() === 'loading'"
    >
      <header class="flex items-center justify-between gap-3 mb-4">
        <h2 class="text-sm font-semibold text-white">{{ title() }}</h2>
        <div class="flex gap-2">
          <button
            type="button"
            class="px-2 py-1 text-xs border border-slate-600 rounded text-slate-300 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
            [disabled]="!canExport()"
            [attr.aria-label]="'Export ' + title() + ' as CSV'"
            (click)="exportCsv.emit()"
          >
            CSV
          </button>
          <button
            type="button"
            class="px-2 py-1 text-xs border border-slate-600 rounded text-slate-300 hover:border-slate-500 disabled:opacity-40 disabled:cursor-not-allowed"
            [disabled]="!canExport()"
            [attr.aria-label]="'Export ' + title() + ' as JSON'"
            (click)="exportJson.emit()"
          >
            JSON
          </button>
        </div>
      </header>

      @switch (status()) {
        @case ('loading') {
          <div role="status" class="h-32 flex items-center justify-center text-sm text-slate-400">
            <span class="animate-pulse">Loading…</span>
          </div>
        }
        @case ('error') {
          <div
            role="alert"
            class="h-32 flex flex-col items-center justify-center gap-2 text-center"
          >
            <p class="text-sm text-red-400">{{ errorMessage() }}</p>
            <button
              type="button"
              class="px-3 py-1 text-xs bg-slate-700 hover:bg-slate-600 text-white rounded"
              (click)="retry.emit()"
            >
              Retry
            </button>
          </div>
        }
        @default {
          @if (empty()) {
            <div class="h-32 flex items-center justify-center text-sm text-slate-400">
              No data yet for this report.
            </div>
          } @else {
            <ng-content />
            @if (table(); as t) {
              <details class="mt-4 text-xs text-slate-400">
                <summary class="cursor-pointer select-none">View as table</summary>
                <table class="w-full mt-2">
                  <caption class="sr-only">
                    {{
                      t.title
                    }}
                  </caption>
                  <thead>
                    <tr class="text-slate-500 border-b border-slate-700">
                      @for (column of t.columns; track column; let first = $first) {
                        <th
                          scope="col"
                          class="py-1 font-medium"
                          [class]="first ? 'text-left' : 'text-right'"
                        >
                          {{ column }}
                        </th>
                      }
                    </tr>
                  </thead>
                  <tbody>
                    @for (row of t.rows; track $index) {
                      <tr class="border-b border-slate-800">
                        @for (cell of row; track $index; let first = $first) {
                          <td class="py-1 font-mono" [class]="first ? 'text-left' : 'text-right'">
                            {{ cell }}
                          </td>
                        }
                      </tr>
                    }
                  </tbody>
                </table>
              </details>
            }
          }
        }
      }
    </section>
  `,
})
export class ReportCardComponent {
  readonly title = input.required<string>();
  readonly status = input.required<'loading' | 'error' | 'ready'>();
  readonly empty = input(false);
  readonly errorMessage = input('');
  readonly table = input<ReportTable | null>(null);

  readonly retry = output<void>();
  readonly exportCsv = output<void>();
  readonly exportJson = output<void>();

  canExport(): boolean {
    return this.status() === 'ready' && !this.empty();
  }
}
