/** Thrown for any failed HTTP call. `status` 0 means a network error or timeout. */
export class HttpError extends Error {
  constructor(
    message: string,
    readonly status: number,
    /** Parsed `Retry-After`, in ms, when the server sent one. */
    readonly retryAfterMs?: number,
    /** True when the server said we hit a rate limit (429, or 403 with limit headers). */
    readonly rateLimited: boolean = false,
  ) {
    super(message);
    this.name = 'HttpError';
  }

  /** 429, 408, 5xx and network failures are worth retrying; other 4xx are not. */
  get retryable(): boolean {
    return (
      this.status === 0 ||
      this.status === 408 ||
      this.status === 429 ||
      this.status >= 500 ||
      this.rateLimited
    );
  }
}

/** `Retry-After` is either delta-seconds or an HTTP date (RFC 9110 10.2.3). */
export function parseRetryAfter(
  value: string | null | undefined,
  now = Date.now(),
): number | undefined {
  if (!value) return undefined;
  const trimmed = value.trim();
  if (/^\d+$/.test(trimmed)) return Number(trimmed) * 1000;
  const date = Date.parse(trimmed);
  if (Number.isNaN(date)) return undefined;
  return Math.max(0, date - now);
}

type HeaderReader = { get(name: string): string | null };

function resetDelay(headers: HeaderReader, now: number): number | undefined {
  if (headers.get('x-ratelimit-remaining')?.trim() !== '0') return undefined;
  const reset = Number(headers.get('x-ratelimit-reset'));
  if (!Number.isFinite(reset) || reset <= 0) return undefined;
  return Math.max(0, reset * 1000 - now);
}

/**
 * Rate-limit info of a failed response. Applies to 403/429 only. `Retry-After` wins; otherwise an
 * exhausted primary limit (`x-ratelimit-remaining: 0`) waits until `x-ratelimit-reset` (epoch s).
 * A 403 without any of those headers is a plain permission error (not a rate limit).
 */
export function rateLimitFromHeaders(
  status: number,
  headers: HeaderReader,
  now = Date.now(),
): { rateLimited: boolean; retryAfterMs?: number } {
  const retryAfter = parseRetryAfter(headers.get('retry-after'), now);
  if (status === 429) {
    return { rateLimited: true, retryAfterMs: retryAfter ?? resetDelay(headers, now) };
  }
  if (status !== 403) return { rateLimited: false };
  if (retryAfter !== undefined) return { rateLimited: true, retryAfterMs: retryAfter };
  if (headers.get('x-ratelimit-remaining')?.trim() === '0') {
    return { rateLimited: true, retryAfterMs: resetDelay(headers, now) };
  }
  return { rateLimited: false };
}

export interface FetchJsonOptions {
  userAgent: string;
  /** Extra request headers (for example `Authorization`); they may override `Accept`. */
  headers?: Record<string, string>;
  now?: () => number;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

export type JsonFetcher = (url: string) => Promise<unknown>;

export function createJsonFetcher(options: FetchJsonOptions): JsonFetcher {
  const doFetch = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? 30_000;
  return async (url) => {
    let res: Response;
    try {
      res = await doFetch(url, {
        headers: {
          'User-Agent': options.userAgent,
          Accept: 'application/json',
          ...options.headers,
        },
        signal: AbortSignal.timeout(timeoutMs),
      });
    } catch (err) {
      throw new HttpError(`Network error for ${url}: ${(err as Error).message}`, 0);
    }
    if (!res.ok) {
      const now = (options.now ?? Date.now)();
      const limit = rateLimitFromHeaders(res.status, res.headers, now);
      throw new HttpError(
        `HTTP ${res.status} for ${url}`,
        res.status,
        limit.retryAfterMs ?? parseRetryAfter(res.headers.get('retry-after'), now),
        limit.rateLimited,
      );
    }
    try {
      return await res.json();
    } catch {
      throw new HttpError(`Invalid JSON from ${url}`, 502);
    }
  };
}
