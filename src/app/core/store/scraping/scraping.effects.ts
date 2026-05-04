import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { interval, of, timer } from 'rxjs';
import { map, catchError, switchMap, exhaustMap, withLatestFrom, filter, take, concatMap, tap } from 'rxjs/operators';
import { ScrapingActions } from './scraping.actions';
import { MockDataService } from '../../services/mock-data.service';
import { selectActiveJobs, selectAllJobs } from './scraping.selectors';
import { ScrapingJob } from '../../models/scraping-job.model';
import { ToastService } from '../../../shared/services/toast.service';

const MAX_RUNNING = 3;

function uuid(): string { return Math.random().toString(36).slice(2) + Date.now().toString(36); }

@Injectable()
export class ScrapingEffects {
  private actions$ = inject(Actions);
  private mockData = inject(MockDataService);
  private store = inject(Store);
  private toast = inject(ToastService);

  loadJobs$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.loadJobs),
      switchMap(() =>
        timer(400).pipe(
          map(() => ScrapingActions.loadJobsSuccess({ jobs: this.mockData.getJobs() })),
          catchError(err => of(ScrapingActions.loadJobsFailure({ error: err.message })))
        )
      )
    )
  );

  startJob$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.startJob),
      exhaustMap(({ name, source, targetUrl, depth, filters }) => {
        const job: ScrapingJob = {
          id: `job-new-${uuid()}`,
          name,
          source,
          targetUrl,
          depth,
          status: 'queued',
          progress: 0,
          leadsFound: 0,
          leadsTarget: 5000,
          errorCount: 0,
          createdAt: new Date(),
          startedAt: new Date(),
          filters,
          priority: 'normal',
        };
        return timer(300).pipe(
          map(() => ScrapingActions.startJobSuccess({ job }))
        );
      })
    )
  );

  // Avanza progress de jobs running
  simulateJobProgress$ = createEffect(() =>
    interval(1200).pipe(
      withLatestFrom(this.store.select(selectActiveJobs)),
      filter(([, jobs]) => jobs.some(j => j.status === 'running')),
      switchMap(([, activeJobs]) => {
        const running = activeJobs.filter(j => j.status === 'running').slice(0, MAX_RUNNING);
        return running.map(job => {
          const updated = this.mockData.updateJobProgress(job);
          if (updated.status === 'completed') {
            return ScrapingActions.jobCompleted({ id: job.id });
          }
          return ScrapingActions.updateJobProgress({
            progress: {
              jobId: job.id,
              progress: updated.progress,
              leadsFound: updated.leadsFound,
              errorCount: updated.errorCount,
              status: updated.status,
            }
          });
        });
      })
    )
  );

  // Notifica solo cuando completa el último job running (no quedan más activos)
  notifyJobCompleted$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.jobCompleted),
      concatMap(() =>
        this.store.select(selectAllJobs).pipe(
          take(1),
          tap(jobs => {
            const stillActive = jobs.some(j => j.status === 'running' || j.status === 'queued');
            if (!stillActive) {
              this.toast.show('success', 'Scraping completed', 'New leads are ready to review');
            }
          })
        )
      )
    ),
    { dispatch: false }
  );

  // Auto-promueve queued → running cuando se libera un slot
  // Usa concatMap + take(1) para leer el store DESPUÉS de que el reducer aplique el cambio
  autoPromoteQueued$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.jobCompleted, ScrapingActions.jobFailed, ScrapingActions.cancelJob),
      concatMap(() =>
        this.store.select(selectAllJobs).pipe(
          take(1),
          switchMap(jobs => {
            const runningCount = jobs.filter(j => j.status === 'running').length;
            const slots = MAX_RUNNING - runningCount;
            if (slots <= 0) return [];
            const next = jobs.filter(j => j.status === 'queued').slice(0, 1); // un slot a la vez
            return next.map(j => ScrapingActions.promoteJob({ id: j.id }));
          })
        )
      )
    )
  );

  // Promueve job inicial al cargar (arranca los primeros MAX_RUNNING queued)
  promoteOnLoad$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.loadJobsSuccess),
      map(({ jobs }) => {
        const alreadyRunning = jobs.filter(j => j.status === 'running').length;
        const slots = Math.max(0, MAX_RUNNING - alreadyRunning);
        return jobs.filter(j => j.status === 'queued').slice(0, slots);
      }),
      switchMap(toPromote => toPromote.map(j => ScrapingActions.promoteJob({ id: j.id })))
    )
  );

}
