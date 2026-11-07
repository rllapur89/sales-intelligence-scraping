import { Directive, ElementRef, Input, OnChanges, inject } from '@angular/core';
import { Store } from '@ngrx/store';
import { toSignal } from '@angular/core/rxjs-interop';
import { selectLeadsFilter } from '../../core/store/leads/leads.selectors';
import { effect } from '@angular/core';

@Directive({
  selector: '[appHighlight]',
  standalone: true,
})
export class HighlightDirective implements OnChanges {
  @Input('appHighlight') text = '';

  private el = inject(ElementRef<HTMLElement>);
  private store = inject(Store);

  private searchTerm = toSignal(
    this.store.select(selectLeadsFilter).pipe(),
    { initialValue: null as any }
  );

  constructor() {
    effect(() => {
      const term = this.searchTerm()?.search ?? '';
      this.render(this.text, term);
    });
  }

  ngOnChanges(): void {
    const term = this.searchTerm()?.search ?? '';
    this.render(this.text, term);
  }

  private render(text: string, term: string): void {
    if (!term) {
      this.el.nativeElement.textContent = text;
      return;
    }
    const escaped = term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const regex = new RegExp(`(${escaped})`, 'gi');
    this.el.nativeElement.innerHTML = text.replace(
      regex,
      '<mark class="bg-yellow-400/40 text-yellow-200 rounded-sm px-0.5">$1</mark>'
    );
  }
}
