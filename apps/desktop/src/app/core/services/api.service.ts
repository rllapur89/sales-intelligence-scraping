import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable } from 'rxjs';
import type {
  Page,
  PipelineStage,
  ScrapingJobDto,
  SourceKey,
  SubscriptionDto,
  SignalDto,
  LeadDto,
  SignalType,
} from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';
import { DashboardMetrics } from '../models/metrics.model';

export interface LeadsPageQuery {
  limit?: number;
  cursor?: string | null;
  sort?: 'score' | 'updated';
}

/** Body of POST/PATCH /api/subscriptions (flat, as validated by the API DTOs). */
export interface SubscriptionBody {
  name?: string;
  active?: boolean;
  industries?: string[];
  regions?: string[];
  signalTypes?: SignalType[];
  minScore?: number;
}

export type LeadDetail = LeadDto & { signals: SignalDto[] };

/** Typed REST client of the leads API. Auth headers are added by `authInterceptor`. */
@Injectable({ providedIn: 'root' })
export class ApiService {
  private readonly http = inject(HttpClient);
  private readonly base = inject(ENVIRONMENT).apiUrl;

  getLeadsPage(query: LeadsPageQuery = {}): Observable<Page<LeadDto>> {
    let params = new HttpParams().set('sort', query.sort ?? 'score');
    if (query.limit) params = params.set('limit', query.limit);
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.http.get<Page<LeadDto>>(`${this.base}/leads`, { params });
  }

  getLead(id: string): Observable<LeadDetail> {
    return this.http.get<LeadDetail>(`${this.base}/leads/${encodeURIComponent(id)}`);
  }

  updateLeadStage(id: string, stage: PipelineStage): Observable<LeadDto> {
    return this.http.patch<LeadDto>(`${this.base}/leads/${encodeURIComponent(id)}/stage`, { stage });
  }

  getJobsPage(query: LeadsPageQuery = {}): Observable<Page<ScrapingJobDto>> {
    let params = new HttpParams();
    if (query.limit) params = params.set('limit', query.limit);
    if (query.cursor) params = params.set('cursor', query.cursor);
    return this.http.get<Page<ScrapingJobDto>>(`${this.base}/jobs`, { params });
  }

  createJob(source: SourceKey, slugs?: string[]): Observable<ScrapingJobDto> {
    return this.http.post<ScrapingJobDto>(`${this.base}/jobs`, slugs?.length ? { source, slugs } : { source });
  }

  cancelJob(id: string): Observable<ScrapingJobDto> {
    return this.http.post<ScrapingJobDto>(`${this.base}/jobs/${encodeURIComponent(id)}/cancel`, {});
  }

  retryJob(id: string): Observable<ScrapingJobDto> {
    return this.http.post<ScrapingJobDto>(`${this.base}/jobs/${encodeURIComponent(id)}/retry`, {});
  }

  getSubscriptions(): Observable<SubscriptionDto[]> {
    return this.http.get<SubscriptionDto[]>(`${this.base}/subscriptions`);
  }

  createSubscription(body: SubscriptionBody): Observable<SubscriptionDto> {
    return this.http.post<SubscriptionDto>(`${this.base}/subscriptions`, body);
  }

  updateSubscription(id: string, body: SubscriptionBody): Observable<SubscriptionDto> {
    return this.http.patch<SubscriptionDto>(`${this.base}/subscriptions/${encodeURIComponent(id)}`, body);
  }

  deleteSubscription(id: string): Observable<void> {
    return this.http.delete<void>(`${this.base}/subscriptions/${encodeURIComponent(id)}`);
  }

  getMetricsSummary(): Observable<DashboardMetrics> {
    return this.http.get<DashboardMetrics>(`${this.base}/metrics/summary`);
  }
}
