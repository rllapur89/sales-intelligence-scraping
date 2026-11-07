import { Component, ChangeDetectionStrategy, computed, inject, signal } from '@angular/core';
import { Store } from '@ngrx/store';
import { Router, NavigationEnd } from '@angular/router';
import { ConnectivityService } from '../../core/services/connectivity.service';
import { DATA_MODE } from '../../core/config/app-environment';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { AuthService } from '../../core/auth/auth.service';
import { connectivityBadge } from './connectivity-badge';
import { selectLeadsFilter } from '../../core/store/leads/leads.selectors';
import { LeadsActions } from '../../core/store/leads/leads.actions';
import { FormsModule } from '@angular/forms';
import { debounceTime, distinctUntilChanged, Subject, filter, map, startWith } from 'rxjs';
import { takeUntilDestroyed, toSignal } from '@angular/core/rxjs-interop';

@Component({
  selector: 'app-header',
  standalone: true,
  imports: [FormsModule],
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
        <!-- Connectivity indicator: navigator.onLine + realtime status -->
        <div class="flex items-center gap-1.5 text-xs" data-testid="connectivity-badge"
             [class]="badgeText()">
          <div class="w-2 h-2 rounded-full" [class]="badgeDot()"></div>
          <span>{{ badge().label }}</span>
        </div>

        <!-- Notification bell -->
        <button class="relative p-2 text-slate-400 hover:text-white hover:bg-slate-800 rounded-lg transition-colors">
          <span class="text-lg">🔔</span>
          <span class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
        </button>

        <!-- User avatar -->
        <div class="flex items-center gap-2 pl-3 border-l border-slate-700">
          <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-purple-600 rounded-full flex items-center justify-center text-xs font-bold text-white">
            {{ initials() }}
          </div>
          <div class="text-xs">
            <div class="text-slate-300 font-medium">{{ displayName() }}</div>
            <div class="text-slate-500">{{ roleLabel() }}</div>
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
  private readonly mode = inject(DATA_MODE);
  private readonly realtime = inject(RealtimeService);
  private readonly auth = inject(AuthService);

  private readonly online = toSignal(this.connectivity.online$, { initialValue: true });
  readonly badge = computed(() => connectivityBadge(this.mode, this.online(), this.realtime.status()));
  readonly badgeText = computed(() => {
    const tone = this.badge().tone;
    return tone === 'green' ? 'text-emerald-400' : tone === 'amber' ? 'text-amber-400' : tone === 'red' ? 'text-red-400' : 'text-slate-400';
  });
  readonly badgeDot = computed(() => {
    const { tone, pulse } = this.badge();
    const color = tone === 'green' ? 'bg-emerald-400' : tone === 'amber' ? 'bg-amber-400' : tone === 'red' ? 'bg-red-400' : 'bg-slate-500';
    return pulse ? color + ' animate-pulse' : color;
  });

  readonly displayName = computed(() => this.auth.user()?.displayName ?? 'John Smith');
  readonly roleLabel = computed(() => (this.auth.user() ? this.auth.user()!.role : 'Sr. Sales Rep'));
  readonly initials = computed(() =>
    this.displayName().split(/s+/).map(p => p[0] ?? '').join('').slice(0, 2).toUpperCase()
  );

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
