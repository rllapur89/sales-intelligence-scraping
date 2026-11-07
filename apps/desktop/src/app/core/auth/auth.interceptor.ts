import { HttpErrorResponse, HttpInterceptorFn, HttpRequest } from '@angular/common/http';
import { inject } from '@angular/core';
import { catchError, switchMap, throwError } from 'rxjs';
import { ENVIRONMENT } from '../config/app-environment';
import { AuthService } from './auth.service';

function withToken(req: HttpRequest<unknown>, token: string): HttpRequest<unknown> {
  return req.clone({ setHeaders: { Authorization: `Bearer ${token}` } });
}

/**
 * Adds the Bearer token to API requests and retries ONCE after a 401, with refreshed tokens.
 * Requests to other origins (and every request in mock mode) pass through untouched.
 */
export const authInterceptor: HttpInterceptorFn = (req, next) => {
  const env = inject(ENVIRONMENT);
  if (env.dataMode !== 'live' || !env.apiUrl || !req.url.startsWith(env.apiUrl)) return next(req);

  const auth = inject(AuthService);
  return auth.ensureToken().pipe(
    switchMap(token => next(withToken(req, token))),
    catchError((err: unknown) => {
      if (!(err instanceof HttpErrorResponse) || err.status !== 401) return throwError(() => err);
      return auth.refresh().pipe(switchMap(res => next(withToken(req, res.accessToken))));
    })
  );
};
