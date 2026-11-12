import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, defer, of } from 'rxjs';
import type { BreakdownDto, FunnelDto, ScoreTrendDto, SignalMixDto } from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';
import {
  byIndustryFromLeads,
  bySourceFromLeads,
  funnelFromLeads,
  scoreTrendFromLeads,
  signalMixFromLeads,
} from '../analytics/mock-analytics';
import { MockDataService } from '../services/mock-data.service';

export abstract class AnalyticsDataSource {
  abstract funnel(): Observable<FunnelDto>;
  abstract bySource(): Observable<BreakdownDto>;
  abstract byIndustry(): Observable<BreakdownDto>;
  abstract signals(): Observable<SignalMixDto>;
  abstract scoreTrend(days: number): Observable<ScoreTrendDto>;
}

/** Mock mode: computes every report from the mock leads, no backend needed. */
@Injectable()
export class MockAnalyticsDataSource extends AnalyticsDataSource {
  private readonly mock = inject(MockDataService);

  funnel(): Observable<FunnelDto> {
    return defer(() => of(funnelFromLeads(this.mock.getLeads())));
  }

  bySource(): Observable<BreakdownDto> {
    return defer(() => of(bySourceFromLeads(this.mock.getLeads())));
  }

  byIndustry(): Observable<BreakdownDto> {
    return defer(() => of(byIndustryFromLeads(this.mock.getLeads())));
  }

  signals(): Observable<SignalMixDto> {
    return defer(() => of(signalMixFromLeads(this.mock.getLeads())));
  }

  scoreTrend(days: number): Observable<ScoreTrendDto> {
    return defer(() => of(scoreTrendFromLeads(this.mock.getLeads(), days)));
  }
}

/** Live mode: the `GET /api/analytics/*` endpoints. Auth headers come from `authInterceptor`. */
@Injectable()
export class LiveAnalyticsDataSource extends AnalyticsDataSource {
  private readonly http = inject(HttpClient);
  private readonly base = `${inject(ENVIRONMENT).apiUrl}/analytics`;

  funnel(): Observable<FunnelDto> {
    return this.http.get<FunnelDto>(`${this.base}/funnel`);
  }

  bySource(): Observable<BreakdownDto> {
    return this.http.get<BreakdownDto>(`${this.base}/by-source`);
  }

  byIndustry(): Observable<BreakdownDto> {
    return this.http.get<BreakdownDto>(`${this.base}/by-industry`);
  }

  signals(): Observable<SignalMixDto> {
    return this.http.get<SignalMixDto>(`${this.base}/signals`);
  }

  scoreTrend(days: number): Observable<ScoreTrendDto> {
    return this.http.get<ScoreTrendDto>(`${this.base}/score-trend`, {
      params: new HttpParams().set('days', days),
    });
  }
}
