import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { EMPTY, interval, of } from 'rxjs';
import {
  map, catchError, switchMap, exhaustMap, withLatestFrom, filter, take, concatMap, tap,
} from 'rxjs/operators';
import { ScrapingActions } from './scraping.actions';
import { MockDataService } from '../../services/mock-data.service';
import { selectActiveJobs, selectAllJobs } from './scraping.selectors';
import { ToastService } from '../../../shared/services/toast.service';
import { JobsDataSource } from '../../data/jobs.data-source';
import { errorMessage } from '../../util/errors';
import { DATA_MODE, ENVIRONMENT } from '../../config/app-environment';

const MAX_RUNNING = 3;

@Injectable()
export class ScrapingEffects {
  private actions$ = inject(Actions);
  private mockData = inject(MockDataService);
  private store = inject(Store);
  private toast = inject(ToastService);
  private source = inject(JobsDataSource);
  private mode = inject(DATA_MODE);
  private env = inject(ENVIRONMENT);

  private readonly isMock = this.mode === 'mock';

  /** Server truth after a mutation (live mode). */
  private resync$() {
    return this.source.list().pipe(
      map(jobs => ScrapingActions.jobsSynced({ jobs })),
      catchError(() => EMPTY)
    );
  }

  loadJobs$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.loadJobs),
      switchMap(() =>
        this.source.list().pipe(
          map(jobs =>
            this.isMock ? ScrapingActions.loadJobsSuccess({ jobs }) : ScrapingActions.jobsSynced({ jobs })
          ),
          catchError((err: unknown) =>
            of(ScrapingActions.loadJobsFailure({ error: errorMessage(err, 'Failed to load jobs') }))
          )
        )
      )
    )
  );

  startJob$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.startJob),
      exhaustMap(({ name, source, slugs }) =>
        this.source.create(name, source, slugs).pipe(
          map(job => ScrapingActions.startJobSuccess({ job })),
          catchError((err: unknown) =>
            of(ScrapingActions.startJobFailure({ error: errorMessage(err, 'Could not create the job') }))
          )
        )
      )
    )
  );

  startJobFailed$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(ScrapingActions.startJobFailure),
        tap(({ error }) => this.toast.show('error', 'Could not start the job', error))
      ),
    { dispatch: false }
  );

  // ---- Live mode: REST mutations and polling ------------------------------------------------

  cancelJobLive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.cancelJob),
      filter(() => !this.isMock),
      concatMap(({ id }) =>
        this.source.cancel(id).pipe(
          switchMap(() => this.resync$()),
          catchError((err: unknown) => {
            this.toast.show('error', 'Could not cancel the job', errorMessage(err, 'Request failed'));
            return this.resync$();
          })
        )
      )
    )
  );

  retryJobLive$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.retryJob),
      filter(() => !this.isMock),
      concatMap(({ id }) =>
        this.source.retry(id).pipe(
          switchMap(() => this.resync$()),
          catchError((err: unknown) => {
            this.toast.show('error', 'Could not retry the job', errorMessage(err, 'Request failed'));
            return this.resync$();
          })
        )
      )
    )
  );

  /** Job progress has no socket event: poll while something is running or queued. */
  pollJobs$ = createEffect(() =>
    this.isMock
      ? EMPTY
      : interval(this.env.jobsPollMs).pipe(
          withLatestFrom(this.store.select(selectActiveJobs)),
          filter(([, active]) => active.length > 0),
          switchMap(() => this.resync$())
        )
  );

  // ---- Mock mode only: simulated scraping ---------------------------------------------------

  // Avanza progress de jobs running
  simulateJobProgress$ = createEffect(() =>
    this.isMock
      ? interval(1200).pipe(
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
                },
              });
            });
          })
        )
      : EMPTY
  );

  // Notifica solo cuando completa el último job running (no quedan más activos)
  notifyJobCompleted$ = createEffect(
    () =>
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

  // Auto-promueve queued → running cuando se libera un slot (mock only)
  // Usa concatMap + take(1) para leer el store DESPUÉS de que el reducer aplique el cambio
  autoPromoteQueued$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.jobCompleted, ScrapingActions.jobFailed, ScrapingActions.cancelJob),
      filter(() => this.isMock),
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

  // Promueve job inicial al cargar (arranca los primeros MAX_RUNNING queued) (mock only)
  promoteOnLoad$ = createEffect(() =>
    this.actions$.pipe(
      ofType(ScrapingActions.loadJobsSuccess),
      filter(() => this.isMock),
      map(({ jobs }) => {
        const alreadyRunning = jobs.filter(j => j.status === 'running').length;
        const slots = Math.max(0, MAX_RUNNING - alreadyRunning);
        return jobs.filter(j => j.status === 'queued').slice(0, slots);
      }),
      switchMap(toPromote => toPromote.map(j => ScrapingActions.promoteJob({ id: j.id })))
    )
  );
}
