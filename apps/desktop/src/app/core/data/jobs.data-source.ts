import { Injectable, inject } from '@angular/core';
import { EMPTY, Observable, expand, map, of, reduce, switchMap, timer } from 'rxjs';
import type { Page, ScrapingJobDto, SourceKey } from '@leads/shared';
import { ApiService } from '../services/api.service';
import { MockDataService } from '../services/mock-data.service';
import { ScrapingJob, toScrapingJob } from '../models/scraping-job.model';

/** Where the scraping store gets its jobs from (mock generator or the REST API). */
export abstract class JobsDataSource {
  abstract list(): Observable<ScrapingJob[]>;
  abstract create(name: string, source: SourceKey, slugs: string[]): Observable<ScrapingJob>;
  /** Emits when the cancellation was accepted. */
  abstract cancel(id: string): Observable<void>;
  /** Creates a NEW job from a failed/cancelled one. */
  abstract retry(id: string): Observable<void>;
}

function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

@Injectable()
export class MockJobsDataSource extends JobsDataSource {
  private readonly mock = inject(MockDataService);

  list(): Observable<ScrapingJob[]> {
    return timer(400).pipe(map(() => this.mock.getJobs()));
  }

  create(name: string, source: SourceKey): Observable<ScrapingJob> {
    const job: ScrapingJob = {
      id: `job-new-${uuid()}`,
      name,
      source,
      status: 'queued',
      progress: 0,
      leadsFound: 0,
      errorCount: 0,
      errors: [],
      createdAt: new Date(),
      startedAt: new Date(),
    };
    return timer(300).pipe(map(() => job));
  }

  cancel(): Observable<void> {
    return of(undefined);
  }

  retry(): Observable<void> {
    return of(undefined);
  }
}

/** Pages through GET /api/jobs (newest first). Exported for tests. */
export function loadAllJobs(
  fetchPage: (cursor: string | null) => Observable<Page<ScrapingJobDto>>,
  maxPages = 10
): Observable<ScrapingJob[]> {
  let pages = 1;
  return fetchPage(null).pipe(
    expand(page => (page.nextCursor && pages++ < maxPages ? fetchPage(page.nextCursor) : EMPTY)),
    reduce<Page<ScrapingJobDto>, ScrapingJob[]>((all, page) => {
      for (const item of page.items) all.push(toScrapingJob(item));
      return all;
    }, [])
  );
}

@Injectable()
export class LiveJobsDataSource extends JobsDataSource {
  private readonly api = inject(ApiService);

  list(): Observable<ScrapingJob[]> {
    return loadAllJobs(cursor => this.api.getJobsPage({ cursor, limit: 100 }));
  }

  create(_name: string, source: SourceKey, slugs: string[]): Observable<ScrapingJob> {
    return this.api.createJob(source, slugs).pipe(map(toScrapingJob));
  }

  cancel(id: string): Observable<void> {
    return this.api.cancelJob(id).pipe(switchMap(() => of(undefined)));
  }

  retry(id: string): Observable<void> {
    return this.api.retryJob(id).pipe(switchMap(() => of(undefined)));
  }
}
