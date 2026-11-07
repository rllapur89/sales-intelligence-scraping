import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { Store } from '@ngrx/store';
import { Observable, of } from 'rxjs';
import {
  map, catchError, switchMap, exhaustMap, mergeMap, filter, tap, debounceTime, withLatestFrom,
} from 'rxjs/operators';
import { LeadsActions } from './leads.actions';
import { selectLeadEntities, selectLeadsForExport } from './leads.selectors';
import { LeadsDataSource } from '../../data/leads.data-source';
import { DATA_MODE, ENVIRONMENT } from '../../config/app-environment';
import { RealtimeService } from '../../realtime/realtime.service';
import { sampleAcks } from '../../realtime/latency-sampler';
import { ToastService } from '../../../shared/services/toast.service';
import { errorMessage } from '../../util/errors';
import { downloadCsv, leadsToCsv } from '../../util/csv';

/** Emits once after the next paint (setTimeout fallback where rAF does not exist). */
function nextFrame(): Observable<number> {
  return new Observable<number>(subscriber => {
    const raf = typeof requestAnimationFrame === 'function' ? requestAnimationFrame : null;
    const handle = raf
      ? raf(() => {
          subscriber.next(Date.now());
          subscriber.complete();
        })
      : null;
    const timeout = raf
      ? null
      : setTimeout(() => {
          subscriber.next(Date.now());
          subscriber.complete();
        }, 16);
    return () => {
      if (handle !== null && typeof cancelAnimationFrame === 'function') cancelAnimationFrame(handle);
      if (timeout !== null) clearTimeout(timeout);
    };
  });
}

/** How long updated rows stay highlighted after the last live batch (ms). */
export const FLASH_DURATION_MS = 2500;

@Injectable()
export class LeadsEffects {
  private actions$ = inject(Actions);
  private store = inject(Store);
  private source = inject(LeadsDataSource);
  private realtime = inject(RealtimeService);
  private toast = inject(ToastService);
  private mode = inject(DATA_MODE);
  private env = inject(ENVIRONMENT);

  loadLeads$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.loadLeads),
      switchMap(() =>
        this.source.loadSnapshot().pipe(
          map(leads => LeadsActions.loadLeadsSuccess({ leads })),
          catchError((err: unknown) =>
            of(LeadsActions.loadLeadsFailure({ error: errorMessage(err, 'Failed to load leads') }))
          )
        )
      )
    )
  );

  exportLeads$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.exportLeads),
      withLatestFrom(this.store.select(selectLeadsForExport)),
      exhaustMap(([, leads]) => {
        downloadCsv(`salesintel-leads-${Date.now()}.csv`, leadsToCsv(leads));
        return of(LeadsActions.exportLeadsSuccess({ count: leads.length }));
      })
    )
  );

  refreshScrapingLead$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.refreshLeadScraping),
      withLatestFrom(this.store.select(selectLeadEntities)),
      filter(([{ id }, entities]) => !!entities[id]),
      switchMap(([{ id }, entities]) =>
        this.source.refreshLead(entities[id]!).pipe(
          map(lead => LeadsActions.refreshLeadScrapingSuccess({ lead })),
          catchError((err: unknown) =>
            of(
              LeadsActions.refreshLeadScrapingFailure({
                id,
                error: errorMessage(err, 'Refresh failed'),
              })
            )
          )
        )
      )
    )
  );

  /** Persists stage changes (PATCH /api/leads/:id/stage in live mode); rolls back on failure. */
  persistStage$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.updateLead),
      filter(({ previous }) => !!previous),
      mergeMap(({ lead, previous }) =>
        this.source.updateStage(lead, lead.stage).pipe(
          map(saved => LeadsActions.updateLeadSuccess({ lead: saved })),
          catchError((err: unknown) =>
            of(
              LeadsActions.updateLeadFailure({
                previous: previous!,
                error: errorMessage(err, 'Could not save the stage'),
              })
            )
          )
        )
      )
    )
  );

  updateLeadFailed$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LeadsActions.updateLeadFailure),
        tap(({ error }) => this.toast.show('error', 'Stage change failed', error))
      ),
    { dispatch: false }
  );

  /** Highlighted rows fade out a moment after the last live batch. */
  clearChanged$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.upsertBatch),
      debounceTime(FLASH_DURATION_MS),
      map(() => LeadsActions.clearChanged())
    )
  );

  /**
   * After a live batch reached the store AND the browser painted it, report the render latency of
   * a sample of its leads (`latency:ack`).
   */
  latencyAck$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LeadsActions.upsertBatch),
        filter(({ origin }) => this.mode === 'live' && origin === 'live'),
        mergeMap(({ batch }) =>
          nextFrame().pipe(
            tap(renderedAt =>
              this.realtime.sendAcks(
                sampleAcks(batch, renderedAt, {
                  rate: this.env.ackSampleRate,
                  max: this.env.ackMaxPerEmit,
                })
              )
            )
          )
        )
      ),
    { dispatch: false }
  );

  /** Closes the gap between the REST snapshot and the socket (events published in between). */
  resyncAfterSnapshot$ = createEffect(
    () =>
      this.actions$.pipe(
        ofType(LeadsActions.loadLeadsSuccess),
        filter(() => this.mode === 'live'),
        tap(() => this.realtime.resyncAfterSnapshot())
      ),
    { dispatch: false }
  );
}
