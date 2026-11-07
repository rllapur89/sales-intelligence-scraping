import { Injectable, computed, inject, signal } from '@angular/core';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Observable, map, of, shareReplay, tap, finalize, catchError } from 'rxjs';
import type { AuthResponse, AuthUserDto } from '@leads/shared';
import { ENVIRONMENT } from '../config/app-environment';

const STORAGE_KEY = 'leads.auth';

interface StoredSession {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}

function readStorage(): StoredSession | null {
  try {
    if (typeof localStorage === 'undefined') return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<StoredSession>;
    if (parsed.accessToken && parsed.refreshToken && parsed.user) return parsed as StoredSession;
    return null;
  } catch {
    return null;
  }
}

function writeStorage(session: StoredSession | null): void {
  try {
    if (typeof localStorage === 'undefined') return;
    if (session) localStorage.setItem(STORAGE_KEY, JSON.stringify(session));
    else localStorage.removeItem(STORAGE_KEY);
  } catch {
    /* storage unavailable (private mode, quota): tokens stay in memory only */
  }
}

/**
 * Live-mode authentication: logs in with the demo user, keeps the token pair in memory (mirrored to
 * localStorage) and rotates it through POST /api/auth/refresh.
 */
@Injectable({ providedIn: 'root' })
export class AuthService {
  private readonly env = inject(ENVIRONMENT);
  /** Bypasses the interceptors: login/refresh must not recurse through `authInterceptor`. */
  private readonly http = new HttpClient(inject(HttpBackend));

  private readonly session = signal<StoredSession | null>(readStorage());
  readonly user = computed(() => this.session()?.user ?? null);
  readonly isAuthenticated = computed(() => this.session() !== null);

  private inflightLogin: Observable<AuthResponse> | null = null;
  private inflightRefresh: Observable<AuthResponse> | null = null;

  accessToken(): string | null {
    return this.session()?.accessToken ?? null;
  }

  login(): Observable<AuthResponse> {
    if (this.inflightLogin) return this.inflightLogin;
    const { email, password } = this.env.demoUser;
    const request = this.http
      .post<AuthResponse>(`${this.env.apiUrl}/auth/login`, { email, password })
      .pipe(
        tap(res => this.store(res)),
        finalize(() => (this.inflightLogin = null)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    this.inflightLogin = request;
    return request;
  }

  /** Rotates the token pair; falls back to a fresh login when there is no (valid) refresh token. */
  refresh(): Observable<AuthResponse> {
    if (this.inflightRefresh) return this.inflightRefresh;
    const refreshToken = this.session()?.refreshToken;
    if (!refreshToken) return this.login();
    const request = this.http
      .post<AuthResponse>(`${this.env.apiUrl}/auth/refresh`, { refreshToken })
      .pipe(
        tap(res => this.store(res)),
        catchError(() => {
          this.clear();
          return this.login();
        }),
        finalize(() => (this.inflightRefresh = null)),
        shareReplay({ bufferSize: 1, refCount: false })
      );
    this.inflightRefresh = request;
    return request;
  }

  /** Emits a usable access token, logging in first when there is none. */
  ensureToken(): Observable<string> {
    const token = this.accessToken();
    if (token) return of(token);
    return this.login().pipe(map(res => res.accessToken));
  }

  logout(): void {
    this.clear();
  }

  private store(res: AuthResponse): void {
    const session: StoredSession = {
      accessToken: res.accessToken,
      refreshToken: res.refreshToken,
      user: res.user,
    };
    this.session.set(session);
    writeStorage(session);
  }

  private clear(): void {
    this.session.set(null);
    writeStorage(null);
  }
}

