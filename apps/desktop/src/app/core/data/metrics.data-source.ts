import { Injectable, inject } from '@angular/core';
import { Observable, of } from 'rxjs';
import { ApiService } from '../services/api.service';
import { DashboardMetrics } from '../models/metrics.model';

export abstract class MetricsDataSource {
  /** Server-side counters; `null` in mock mode (the dashboard derives them from the store). */
  abstract summary(): Observable<DashboardMetrics | null>;
}

@Injectable()
export class MockMetricsDataSource extends MetricsDataSource {
  summary(): Observable<DashboardMetrics | null> {
    return of(null);
  }
}

@Injectable()
export class LiveMetricsDataSource extends MetricsDataSource {
  private readonly api = inject(ApiService);

  summary(): Observable<DashboardMetrics | null> {
    return this.api.getMetricsSummary();
  }
}
