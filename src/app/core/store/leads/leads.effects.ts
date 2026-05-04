import { Injectable, inject } from '@angular/core';
import { Actions, createEffect, ofType } from '@ngrx/effects';
import { of, timer } from 'rxjs';
import { map, catchError, switchMap, exhaustMap, delay } from 'rxjs/operators';
import { LeadsActions } from './leads.actions';
import { MockDataService } from '../../services/mock-data.service';

@Injectable()
export class LeadsEffects {
  private actions$ = inject(Actions);
  private mockData = inject(MockDataService);

  loadLeads$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.loadLeads),
      switchMap(() =>
        // Simula latencia del backend .NET
        timer(600).pipe(
          map(() => LeadsActions.loadLeadsSuccess({ leads: this.mockData.getLeads() })),
          catchError(err => of(LeadsActions.loadLeadsFailure({ error: err.message })))
        )
      )
    )
  );

  exportLeads$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.exportLeads),
      exhaustMap(() =>
        // Simula background job de export
        timer(2000).pipe(
          map(() => LeadsActions.exportLeadsSuccess({ count: 1200 }))
        )
      )
    )
  );

  refreshScrapingLead$ = createEffect(() =>
    this.actions$.pipe(
      ofType(LeadsActions.refreshLeadScraping),
      switchMap(({ id }) =>
        timer(1500 + Math.random() * 1000).pipe(
          map(() => {
            const refreshed = this.mockData.generateNewLead();
            return LeadsActions.refreshLeadScrapingSuccess({
              lead: { ...refreshed, id, scrapingStatus: 'updated' }
            });
          })
        )
      )
    )
  );
}
