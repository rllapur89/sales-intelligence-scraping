import { Component, ChangeDetectionStrategy, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { Router, NavigationEnd } from '@angular/router';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { selectLeadsFilter } from '../../core/store/leads/leads.selectors';
import { LeadsActions } from '../../core/store/leads/leads.actions';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, filter, map, startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [AsyncPipe, FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="h-14 bg-slate-900 border-b border-slate-800 flex items-center px-4 gap-4 shrink-0">

      <!-- Global search — only show on leads page -->
      @if (isLeadsPage()) {
        <div class="relative flex-1 max-w-md">
          <span class="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500 text-sm">🔍</span>
          <input
            type="text"
            placeholder="Search leads, companies..."
            [ngModel]="searchValue()"
            (ngModelChange)="onSearch($event)"
            class="w-full bg-slate-800 border border-slate-700 rounded-lg pl-9 pr-4 py-2 text-sm text-slate-200 placeholder-slate-500 focus:outline-none focus:border-blue-500 transition-colors"
          />
        </div>
      }

      <div class="flex items-center gap-3 ml-auto">
        <!-- Connectivity indicator -->
        @if (connectivity.online$ | async; as online) {
          <div class="flex items-center gap-1.5 text-xs"
               [class]="online ? 'text-emerald-400' : 'text-red-400'">
            <div class="w-2 h-2 rounded-full"
                 [class]="online ? 'bg-emerald-400 animate-pulse' : 'bg-red-400'"></div>
            <span>{{ online ? 'Online' : 'Offline' }}</span>
          </div>
        }

        <!-- Notification bell -->
        <button class="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
          <span class="text-lg">🔔</span>
          <span class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
        </button>

        <!-- User avatar -->
        <div class="flex items-center gap-2 pl-3 border-l border-slate-700">
          <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
            JS
          </div>
          <div class="text-xs">
            <div class="text-slate-300 font-medium">John Smith</div>
            <div class="text-slate-500">Sr. Sales Rep</div>
          </div>
        </div>
      </div>
    </header>
  `,
})
export class HeaderComponent {
  private store = inject(Store);
  private router = inject(Router);
  readonly connectivity = inject(ConnectivityService);

  private search$ = new Subject<string>();
  readonly searchValue = signal('');

  readonly isLeadsPage = toSignal(
    this.router.events.pipe(
      filter(event => event instanceof NavigationEnd),
      map(event => (event as NavigationEnd).url.includes('/leads')),
      startWith(this.router.url.includes('/leads'))
    ),
    { initialValue: false }
  );

  constructor() {
    // switchMap pattern del interview: debounce + distinctUntilChanged
    this.search$.pipe(
      debounceTime(1000),
      distinctUntilChanged(),
      takeUntilDestroyed(),
    ).subscribe(term => {
      this.store.dispatch(LeadsActions.setFilter({ filter: { search: term } }));
    });
  }

  onSearch(value: string): void {
    this.searchValue.set(value);
    this.search$.next(value);
  }
}
