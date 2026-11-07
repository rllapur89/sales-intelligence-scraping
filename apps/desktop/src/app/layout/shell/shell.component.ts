import { Component, ChangeDetectionStrategy, OnInit, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { Store } from '@ngrx/store';
import { SidebarComponent } from '../sidebar/sidebar.component';
import { HeaderComponent } from '../header/header.component';
import { LeadsActions } from '../../core/store/leads/leads.actions';
import { ScrapingActions } from '../../core/store/scraping/scraping.actions';
import { DATA_MODE } from '../../core/config/app-environment';
import { RealtimeService } from '../../core/realtime/realtime.service';
import { ToastComponent } from '../../shared/components/toast/toast.component';

@Component({
  selector: 'app-shell',
  standalone: true,
  imports: [RouterOutlet, SidebarComponent, HeaderComponent, ToastComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="flex h-screen bg-slate-950 text-slate-100 overflow-hidden">
      <app-sidebar />
      <div class="flex flex-col flex-1 min-w-0 overflow-hidden">
        <app-header />
        <main class="flex-1 overflow-auto">
          <router-outlet />
        </main>
      </div>
    </div>
    <app-toast />
  `,
})
export class ShellComponent implements OnInit {
  private store = inject(Store);
  private realtime = inject(RealtimeService);
  private mode = inject(DATA_MODE);

  ngOnInit(): void {
    this.store.dispatch(LeadsActions.loadLeads());
    this.store.dispatch(ScrapingActions.loadJobs());
    if (this.mode === 'live') this.realtime.start();
  }
}
