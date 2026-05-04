import { Routes } from '@angular/router';
import { ShellComponent } from './layout/shell/shell.component';

export const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'dashboard', pathMatch: 'full' },
      {
        path: 'dashboard',
        loadComponent: () =>
          import('./features/dashboard/dashboard.component').then(m => m.DashboardComponent),
        title: 'Dashboard '
      },
      {
        path: 'leads',
        loadComponent: () =>
          import('./features/leads/leads.component').then(m => m.LeadsComponent),
        title: 'Leads '
      },
      {
        path: 'scraping',
        loadComponent: () =>
          import('./features/scraping/scraping.component').then(m => m.ScrapingComponent),
        title: 'Scraping Jobs '
      },
      {
        path: 'pipeline',
        loadComponent: () =>
          import('./features/pipeline/pipeline.component').then(m => m.PipelineComponent),
        title: 'Pipeline '
      },
      {
        path: 'reports',
        loadComponent: () =>
          import('./features/reports/reports.component').then(m => m.ReportsComponent),
        title: 'Reports '
      },
    ]
  },
  { path: '**', redirectTo: '' }
];
