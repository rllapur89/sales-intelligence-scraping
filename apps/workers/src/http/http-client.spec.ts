import { describe, expect, it, vi } from 'vitest';
import { HttpError, createJsonFetcher, parseRetryAfter, rateLimitFromHeaders } from './http-client';

const res = (status: number, body: unknown = {}, headers: Record<string, string> = {}): Response =>
  new Response(JSON.stringify(body), { status, headers });

describe('parseRetryAfter', () => {
  it('parses delta-seconds', () => expect(parseRetryAfter('120')).toBe(120_000));
  it('parses an HTTP date relative to now', () => {
    const now = Date.parse('2026-01-01T00:00:00Z');
    expect(parseRetryAfter('Thu, 01 Jan 2026 00:01:00 GMT', now)).toBe(60_000);
  });
  it('clamps past dates to zero', () => {
    expect(
      parseRetryAfter('Thu, 01 Jan 2026 00:00:00 GMT', Date.parse('2026-01-02T00:00:00Z')),
    ).toBe(0);
  });
  it('returns undefined for garbage or missing values', () => {
    expect(parseRetryAfter('soon')).toBeUndefined();
    expect(parseRetryAfter(null)).toBeUndefined();
  });
});

describe('rate limit headers', () => {
  const now = Date.parse('2026-01-01T00:00:00Z');
  const resetAt = String(now / 1000 + 90);
  const h = (o: Record<string, string>): Headers => new Headers(o);

  it('sends extra headers next to the User-Agent', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, {}));
    await createJsonFetcher({
      userAgent: 'ua',
      headers: { Authorization: 'Bearer t', Accept: 'application/vnd.github+json' },
      fetchImpl,
    })('https://x.test');
    const headers = (fetchImpl.mock.calls[0]?.[1] as RequestInit).headers as Record<string, string>;
    expect(headers).toEqual({
      'User-Agent': 'ua',
      Authorization: 'Bearer t',
      Accept: 'application/vnd.github+json',
    });
  });

  it('derives retryAfterMs from x-ratelimit-reset on an exhausted 403', async () => {
    const fetchImpl = vi
      .fn()
      .mockResolvedValue(
        res(403, {}, { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetAt }),
      );
    const err = (await createJsonFetcher({ userAgent: 'u', fetchImpl, now: () => now })(
      'https://x.test',
    ).catch((e: unknown) => e)) as HttpError;
    expect(err.status).toBe(403);
    expect(err.retryAfterMs).toBe(90_000);
    expect(err.rateLimited).toBe(true);
    expect(err.retryable).toBe(true);
  });

  it('uses the reset header on 429 and prefers Retry-After', () => {
    const limited = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': resetAt };
    expect(rateLimitFromHeaders(429, h(limited), now)).toEqual({
      rateLimited: true,
      retryAfterMs: 90_000,
    });
    expect(rateLimitFromHeaders(403, h({ ...limited, 'retry-after': '30' }), now)).toEqual({
      rateLimited: true,
      retryAfterMs: 30_000,
    });
  });

  it('keeps a plain 403 non-retryable and clamps a reset in the past to 0', () => {
    expect(rateLimitFromHeaders(403, h({ 'x-ratelimit-remaining': '12' }), now)).toEqual({
      rateLimited: false,
    });
    const past = { 'x-ratelimit-remaining': '0', 'x-ratelimit-reset': String(now / 1000 - 5) };
    expect(rateLimitFromHeaders(403, h(past), now).retryAfterMs).toBe(0);
    expect(rateLimitFromHeaders(404, h({}), now)).toEqual({ rateLimited: false });
  });
});

describe('createJsonFetcher', () => {
  it('sends the User-Agent and returns parsed JSON', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(200, { ok: 1 }));
    const get = createJsonFetcher({ userAgent: 'test-agent', fetchImpl });
    await expect(get('https://x.test/a')).resolves.toEqual({ ok: 1 });
    const init = fetchImpl.mock.calls[0]?.[1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe('test-agent');
  });

  it('turns 429 into a retryable HttpError carrying Retry-After', async () => {
    const fetchImpl = vi.fn().mockResolvedValue(res(429, {}, { 'retry-after': '7' }));
    const err = await createJsonFetcher({ userAgent: 'u', fetchImpl })('https://x.test').catch(
      (e: unknown) => e,
    );
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(429);
    expect((err as HttpError).retryAfterMs).toBe(7000);
    expect((err as HttpError).retryable).toBe(true);
  });

  it('marks 404 as not retryable and 503 as retryable', async () => {
    const get404 = createJsonFetcher({
      userAgent: 'u',
      fetchImpl: vi.fn().mockResolvedValue(res(404)),
    });
    const get503 = createJsonFetcher({
      userAgent: 'u',
      fetchImpl: vi.fn().mockResolvedValue(res(503)),
    });
    expect(((await get404('https://x.test').catch((e: unknown) => e)) as HttpError).retryable).toBe(
      false,
    );
    expect(((await get503('https://x.test').catch((e: unknown) => e)) as HttpError).retryable).toBe(
      true,
    );
  });

  it('maps network failures to status 0 (retryable)', async () => {
    const get = createJsonFetcher({
      userAgent: 'u',
      fetchImpl: vi.fn().mockRejectedValue(new Error('ECONNRESET')),
    });
    const err = (await get('https://x.test').catch((e: unknown) => e)) as HttpError;
    expect(err.status).toBe(0);
    expect(err.retryable).toBe(true);
  });
});
