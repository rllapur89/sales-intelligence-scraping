import { Injectable } from '@angular/core';
import { fromEvent, merge, of } from 'rxjs';
import { map, distinctUntilChanged, shareReplay } from 'rxjs/operators';

@Injectable({ providedIn: 'root' })
export class ConnectivityService {
  readonly online$ = merge(
    of(navigator.onLine),
    fromEvent(window, 'online').pipe(map(() => true)),
    fromEvent(window, 'offline').pipe(map(() => false))
  ).pipe(
    distinctUntilChanged(),
    shareReplay(1)
  );
}
