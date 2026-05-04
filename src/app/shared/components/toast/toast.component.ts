import { Component, ChangeDetectionStrategy, inject } from '@angular/core';
import { ToastService } from '../../services/toast.service';

@Component({
  selector: 'app-toast',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="fixed bottom-6 right-6 z-50 flex flex-col gap-3 pointer-events-none">
      @for (toast of toastService.toasts(); track toast.id) {
        <div
          class="flex items-start gap-3 px-4 py-3 rounded-xl shadow-xl border pointer-events-auto min-w-72 max-w-sm animate-slide-in"
          [class]="cardClass(toast.type)">
          <span class="text-lg shrink-0 mt-0.5">{{ icon(toast.type) }}</span>
          <div class="flex-1 min-w-0">
            <div class="font-semibold text-sm">{{ toast.title }}</div>
            @if (toast.message) {
              <div class="text-xs mt-0.5 opacity-80 truncate">{{ toast.message }}</div>
            }
          </div>
          <button (click)="toastService.dismiss(toast.id)"
                  class="text-xs opacity-50 hover:opacity-100 transition-opacity shrink-0 mt-0.5">
            ✕
          </button>
        </div>
      }
    </div>
  `,
  styles: [`
    @keyframes slide-in {
      from { opacity: 0; transform: translateX(1rem); }
      to   { opacity: 1; transform: translateX(0); }
    }
    .animate-slide-in { animation: slide-in 0.2s ease-out; }
  `],
})
export class ToastComponent {
  readonly toastService = inject(ToastService);

  icon(type: string): string {
    return { success: '✅', error: '❌', info: 'ℹ️' }[type] ?? 'ℹ️';
  }

  cardClass(type: string): string {
    return {
      success: 'bg-slate-900 border-emerald-700 text-emerald-100',
      error:   'bg-slate-900 border-red-700 text-red-100',
      info:    'bg-slate-900 border-blue-700 text-blue-100',
    }[type] ?? 'bg-slate-900 border-slate-700 text-slate-100';
  }
}
