import { Component, Input, Output, EventEmitter, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'app-empty-state',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex flex-col items-center justify-center py-16 text-center">
      <div class="text-5xl mb-4">{{ icon }}</div>
      <h3 class="text-lg font-semibold text-slate-300 mb-2">{{ title }}</h3>
      <p class="text-sm text-slate-500 max-w-xs mb-6">{{ message }}</p>
      @if (actionLabel) {
        <button (click)="action.emit()"
          class="px-4 py-2 bg-blue-600 hover:bg-blue-500 text-white text-sm rounded-lg transition-colors">
          {{ actionLabel }}
        </button>
      }
    </div>
  `,
})
export class EmptyStateComponent {
  @Input() icon = '🔍';
  @Input() title = 'No results found';
  @Input() message = 'Try adjusting your filters or search terms.';
  @Input() actionLabel = '';
  @Output() action = new EventEmitter<void>();
}
