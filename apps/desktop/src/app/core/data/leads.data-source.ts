import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, delay, expand, map, of, reduce, timer } from 'rxjs';
import type { Page, PipelineStage, SignalDto } from '@leads/shared';
import { ApiService } from '../services/api.service';
import { MockDataService } from '../services/mock-data.service';
import { ENVIRONMENT } from '../config/app-environment';
import { Lead } from '../models/lead.model';

/** Where the leads store gets its data from (mock generator or the REST API). */
export abstract class LeadsDataSource {
  /** The full lead list (the live implementation pages through the API with keyset pagination). */
  abstract loadSnapshot(): Observable<Lead[]>;
  /** Persists a stage change and emits the server version of the lead. */
  abstract updateStage(lead: Lead, stage: PipelineStage): Observable<Lead>;
  /** A fresh copy of the lead (re-scrape in mock mode, GET /api/leads/:id in live mode). */
  abstract refreshLead(lead: Lead): Observable<Lead>;
  /** The latest signals of a lead for the detail panel (live: GET /api/leads/:id, latest 50). */
  abstract loadSignals(lead: Lead): Observable<SignalDto[]>;
}

@Injectable()
export class MockLeadsDataSource extends LeadsDataSource {
  private readonly mock = inject(MockDataService);

  loadSnapshot(): Observable<Lead[]> {
    // Simulated backend latency
    return timer(600).pipe(map(() => this.mock.getLeads()));
  }

  updateStage(lead: Lead, stage: PipelineStage): Observable<Lead> {
    return of({ ...lead, stage });
  }

  refreshLead(lead: Lead): Observable<Lead> {
    return of(lead).pipe(
      delay(1500 + Math.random() * 1000),
      map(l => this.mock.refreshLead(l))
    );
  }

  /** Mock leads have no stored signals. */
  loadSignals(): Observable<SignalDto[]> {
    return of([]);
  }
}

/**
 * Loads pages of `pageSize` leads (score desc) until `nextCursor` is null or `maxLeads` is reached.
 * Exported for tests.
 */
export function loadAllLeads(
  fetchPage: (cursor: string | null, limit: number) => Observable<Page<Lead>>,
  pageSize: number,
  maxLeads: number
): Observable<Lead[]> {
  let loaded = 0;
  return fetchPage(null, Math.min(pageSize, maxLeads)).pipe(
    expand(page => {
      loaded += page.items.length;
      const remaining = maxLeads - loaded;
      if (!page.nextCursor || remaining <= 0 || page.items.length === 0) return EMPTY;
      return fetchPage(page.nextCursor, Math.min(pageSize, remaining));
    }),
    reduce<Page<Lead>, Lead[]>((all, page) => {
      for (const item of page.items) all.push(item);
      return all;
    }, [])
  );
}

@Injectable()
export class LiveLeadsDataSource extends LeadsDataSource {
  private readonly api = inject(ApiService);
  private readonly env = inject(ENVIRONMENT);

  loadSnapshot(): Observable<Lead[]> {
    return loadAllLeads(
      (cursor, limit) => this.api.getLeadsPage({ cursor, limit, sort: 'score' }),
      this.env.snapshotPageSize,
      this.env.snapshotMaxLeads
    );
  }

  updateStage(lead: Lead, stage: PipelineStage): Observable<Lead> {
    return this.api.updateLeadStage(lead.id, stage);
  }

  refreshLead(lead: Lead): Observable<Lead> {
    return this.api.getLead(lead.id).pipe(
      map(({ signals: _signals, ...rest }) => rest)
    );
  }

  loadSignals(lead: Lead): Observable<SignalDto[]> {
    return this.api.getLead(lead.id).pipe(map(detail => detail.signals));
  }
}
