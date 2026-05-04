import { Component, ChangeDetectionStrategy, signal, inject } from '@angular/core';
import { RouterLink, RouterLinkActive } from '@angular/router';
import { Store } from '@ngrx/store';
import { AsyncPipe } from '@angular/common';
import { map } from 'rxjs/operators';
import { selectActiveJobs } from '../../core/store/scraping/scraping.selectors';

@Component({
  selector: 'app-sidebar',
  standalone: true,
  imports: [RouterLink, RouterLinkActive, AsyncPipe],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <aside class="flex flex-col h-full bg-slate-900 border-r border-slate-800 transition-all duration-300"
           [class]="collapsed() ? 'w-16' : 'w-60'">

      <!-- Logo -->
      <div class="flex items-center gap-3 px-4 py-5 border-b border-slate-800 shrink-0">
        <div class="w-8 h-8 bg-gradient-to-br from-blue-500 to-emerald-500 rounded-lg flex items-center justify-center text-sm font-bold shrink-0">C</div>
        @if (!collapsed()) {
          <div>
            <div class="text-sm font-bold text-white">SalesIntel</div>
            <div class="text-[10px] text-slate-500">Sales Intelligence</div>
          </div>
        }
      </div>

      <!-- Nav -->
      <nav class="flex-1 py-4 space-y-1 px-2 overflow-y-auto">
        @for (item of navItems; track item.path) {
          <a [routerLink]="item.path" routerLinkActive="!bg-blue-600/20 !text-blue-400 !border-blue-500/30"
             class="flex items-center gap-3 px-3 py-2.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800 border border-transparent transition-all relative"
             [class]="collapsed() ? 'justify-center' : ''">
            <span class="text-lg shrink-0">{{ item.icon }}</span>
            @if (!collapsed()) {
              <span class="text-sm font-medium">{{ item.label }}</span>
              @if (item.label === 'Scraping') {
                @if (activeCount$ | async; as count) {
                  @if (count > 0) {
                    <span class="ml-auto bg-blue-500 text-white text-[10px] font-bold px-1.5 py-0.5 rounded-full">{{ count }}</span>
                  }
                }
              }
            }
            @if (collapsed() && item.label === 'Scraping') {
              @if (activeCount$ | async; as count) {
                @if (count > 0) {
                  <span class="absolute top-1 right-1 w-2 h-2 bg-blue-500 rounded-full"></span>
                }
              }
            }
          </a>
        }
      </nav>

      <!-- Collapse toggle -->
      <div class="p-2 border-t border-slate-800 shrink-0">
        <button (click)="collapsed.update(v => !v)"
          class="w-full flex items-center justify-center gap-2 px-3 py-2 text-slate-500 hover:text-white hover:bg-slate-800 rounded-lg transition-colors text-sm">
          <span>{{ collapsed() ? '→' : '←' }}</span>
          @if (!collapsed()) { <span>Collapse</span> }
        </button>
      </div>
    </aside>
  `,
})
export class SidebarComponent {
  private store = inject(Store);

  collapsed = signal(false);

  readonly activeCount$ = this.store.select(selectActiveJobs).pipe(
    map(jobs => jobs.length)
  );

  readonly navItems = [
    { path: '/dashboard', label: 'Dashboard', icon: '📊' },
    { path: '/leads', label: 'Leads', icon: '👥' },
    { path: '/scraping', label: 'Scraping', icon: '🕷️' },
    { path: '/pipeline', label: 'Pipeline', icon: '📋' },
    { path: '/reports', label: 'Reports', icon: '📈' },
  ];
}
