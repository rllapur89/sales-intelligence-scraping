import { Component, Input, ChangeDetectionStrategy } from '@angular/core';
import { DecimalPipe } from '@angular/common';

@Component({
  selector: 'app-stat-card',
  standalone: true,
  imports: [DecimalPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="bg-slate-800 border border-slate-700 rounded-xl p-5 flex flex-col gap-3 hover:border-slate-600 transition-colors">
      <div class="flex items-start justify-between">
        <div class="p-2 rounded-lg" [class]="iconBg">
          <span class="text-xl">{{ icon }}</span>
        </div>
        @if (trend !== 0) {
          <div class="flex items-center gap-1 text-xs font-medium"
               [class]="trend > 0 ? 'text-emerald-400' : 'text-red-400'">
            <span>{{ trend > 0 ? '↑' : '↓' }}</span>
            <span>{{ trend | number:'1.1-1' }}%</span>
          </div>
        }
      </div>
      <div>
        <div class="text-2xl font-bold text-white font-mono">{{ displayValue }}</div>
        <div class="text-xs text-slate-400 mt-0.5">{{ label }}</div>
      </div>
      @if (subtitle) {
        <div class="text-[10px] text-slate-500 border-t border-slate-700/50 pt-2">{{ subtitle }}</div>
      }
    </div>
  `,
})
export class StatCardComponent {
  @Input() label = '';
  @Input() value: number | string = 0;
  @Input() icon = '📊';
  @Input() iconBg = 'bg-slate-700';
  @Input() trend = 0;
  @Input() subtitle = '';
  @Input() format: 'number' | 'currency' | 'percent' | 'raw' = 'number';

  get displayValue(): string {
    if (this.format === 'currency') {
      return '$' + Number(this.value).toLocaleString();
    }
    if (this.format === 'percent') return `${this.value}%`;
    if (this.format === 'raw') return String(this.value);
    return Number(this.value).toLocaleString();
  }
}
