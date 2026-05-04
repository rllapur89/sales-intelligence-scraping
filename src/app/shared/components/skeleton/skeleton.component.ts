import { Component, Input, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-skeleton',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="space-y-2">
      @for (row of rows; track $index) {
        <div class="flex gap-3 items-center px-4 py-3">
          <div class="w-8 h-8 rounded-full bg-slate-700 animate-pulse shrink-0"></div>
          <div class="flex-1 space-y-1.5">
            <div class="h-3 bg-slate-700 animate-pulse rounded" [style.width]="widths[$index % widths.length]"></div>
            <div class="h-2.5 bg-slate-800 animate-pulse rounded w-2/3"></div>
          </div>
          <div class="h-3 w-12 bg-slate-700 animate-pulse rounded"></div>
          <div class="h-5 w-16 bg-slate-800 animate-pulse rounded-full"></div>
        </div>
      }
    </div>
  `,
})
export class SkeletonComponent {
  @Input() count = 10;
  readonly widths = ['75%', '60%', '80%', '55%', '70%'];
  get rows() { return Array(this.count).fill(0); }
}
