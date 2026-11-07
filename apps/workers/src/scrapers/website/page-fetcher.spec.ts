import { describe, expect, it, vi } from 'vitest';
import { HttpError } from '../../http/http-client';
import {
  HttpPageFetcher,
  PlaywrightPageFetcher,
  TooManyRedirectsError,
  WEBSITE_USER_AGENT,
  type PwBrowser,
  type PwModule,
  type PwPage,
} from './page-fetcher';

function redirect(location: string, status = 302): Response {
  return new Response(null, { status, headers: { location } });
}

describe('HttpPageFetcher', () => {
  it('returns status, lower-case headers, body and final url, sending our User-Agent', async () => {
    const fetchImpl = vi.fn(
      async (_url: string | URL | Request, _init?: RequestInit) =>
        new Response('<html>hi</html>', { status: 200, headers: { Server: 'nginx' } }),
    );
    const res = await new HttpPageFetcher({ fetchImpl }).fetchPage('https://a.com/');
    expect(res).toEqual({
      status: 200,
      headers: { server: 'nginx', 'content-type': 'text/plain;charset=UTF-8' },
      body: '<html>hi</html>',
      finalUrl: 'https://a.com/',
    });
    const init = fetchImpl.mock.calls[0]![1] as RequestInit;
    expect((init.headers as Record<string, string>)['User-Agent']).toBe(WEBSITE_USER_AGENT);
    expect(init.redirect).toBe('manual');
  });

  it('follows redirects manually, resolving relative locations', async () => {
    const urls: string[] = [];
    const fetchImpl = vi.fn(async (url: string | URL | Request) => {
      urls.push(String(url));
      if (urls.length === 1) return redirect('https://www.a.com/home', 301);
      if (urls.length === 2) return redirect('/final');
      return new Response('ok');
    });
    const res = await new HttpPageFetcher({ fetchImpl }).fetchPage('https://a.com/');
    expect(urls).toEqual(['https://a.com/', 'https://www.a.com/home', 'https://www.a.com/final']);
    expect(res.finalUrl).toBe('https://www.a.com/final');
    expect(res.body).toBe('ok');
  });

  it('allows 5 redirects and rejects the 6th', async () => {
    let calls = 0;
    const fiveThenOk = vi.fn(async () => (++calls <= 5 ? redirect('/next') : new Response('ok')));
    expect(
      (await new HttpPageFetcher({ fetchImpl: fiveThenOk }).fetchPage('https://a.com/')).status,
    ).toBe(200);
    const endless = vi.fn(async () => redirect('/next'));
    await expect(
      new HttpPageFetcher({ fetchImpl: endless }).fetchPage('https://a.com/'),
    ).rejects.toBeInstanceOf(TooManyRedirectsError);
    expect(endless).toHaveBeenCalledTimes(6);
  });

  it('returns non-2xx statuses instead of throwing', async () => {
    const fetchImpl = vi.fn(async () => new Response('nope', { status: 503 }));
    expect((await new HttpPageFetcher({ fetchImpl }).fetchPage('https://a.com/')).status).toBe(503);
  });

  it('caps the body at the configured size', async () => {
    const fetchImpl = vi.fn(async () => new Response('x'.repeat(5000)));
    const res = await new HttpPageFetcher({ fetchImpl, maxBodyBytes: 1000 }).fetchPage(
      'https://a.com/',
    );
    expect(res.body).toHaveLength(1000);
  });

  it('caps the body at 1 MB by default', async () => {
    const fetchImpl = vi.fn(async () => new Response('y'.repeat(1_200_000)));
    const res = await new HttpPageFetcher({ fetchImpl }).fetchPage('https://a.com/');
    expect(res.body).toHaveLength(1_000_000);
  });

  it('wraps network errors as HttpError status 0', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new TypeError('fetch failed');
    });
    const err = await new HttpPageFetcher({ fetchImpl })
      .fetchPage('https://a.com/')
      .catch((e) => e);
    expect(err).toBeInstanceOf(HttpError);
    expect((err as HttpError).status).toBe(0);
  });
});

describe('PlaywrightPageFetcher', () => {
  function fakeModule() {
    const closeContext = vi.fn(async () => undefined);
    const closeBrowser = vi.fn(async () => undefined);
    const page: PwPage = {
      goto: vi.fn(async () => ({ status: () => 200, headers: () => ({ Server: 'cloudflare' }) })),
      content: vi.fn(async () => '<html>rendered</html>'),
      url: () => 'https://a.com/home',
    };
    const browser: PwBrowser = {
      newContext: vi.fn(async () => ({ newPage: async () => page, close: closeContext })),
      close: closeBrowser,
    };
    const launch = vi.fn(async () => browser);
    const mod: PwModule = { chromium: { launch } };
    return { mod, launch, closeContext, closeBrowser, browser };
  }

  it('loads the module lazily, launches once and maps the response', async () => {
    const { mod, launch, closeContext, closeBrowser } = fakeModule();
    const loadModule = vi.fn(async () => mod);
    const fetcher = new PlaywrightPageFetcher({ loadModule });
    expect(loadModule).not.toHaveBeenCalled();
    const res = await fetcher.fetchPage('https://a.com/');
    await fetcher.fetchPage('https://a.com/');
    expect(res).toEqual({
      status: 200,
      headers: { server: 'cloudflare' },
      body: '<html>rendered</html>',
      finalUrl: 'https://a.com/home',
    });
    expect(loadModule).toHaveBeenCalledTimes(1);
    expect(launch).toHaveBeenCalledTimes(1);
    expect(closeContext).toHaveBeenCalledTimes(2);
    await fetcher.close();
    expect(closeBrowser).toHaveBeenCalledTimes(1);
  });

  it('reports a helpful error when playwright-core is not installed', async () => {
    const fetcher = new PlaywrightPageFetcher();
    await expect(fetcher.fetchPage('https://a.com/')).rejects.toThrow('playwright-core');
  });
});
