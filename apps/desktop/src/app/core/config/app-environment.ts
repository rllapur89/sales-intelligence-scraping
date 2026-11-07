import { InjectionToken, inject } from '@angular/core';
import { environment } from '../../../environments/environment';
import type { DataMode, Environment } from '../../../environments/environment.model';

/** The active build environment (replaced by `environment.live.ts` in the `live` configuration). */
export const ENVIRONMENT = new InjectionToken<Environment>('ENVIRONMENT', {
  providedIn: 'root',
  factory: () => environment,
});

/** `mock` or `live`; derived from the environment so tests can override either token. */
export const DATA_MODE = new InjectionToken<DataMode>('DATA_MODE', {
  providedIn: 'root',
  factory: () => inject(ENVIRONMENT).dataMode,
});
