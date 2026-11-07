import { HttpError } from '../../http/http-client';

export const WEBSITE_USER_AGENT =
  'LeadsSalesIntelligenceBot/0.1 (+https://github.com/rllapur89/sales-intelligence-scraping)';
export const MAX_BODY_BYTES = 1_000_000;
export const MAX_REDIRECTS = 5;

export interface FetchedPage {
  status: number;
  /** Header names are lower-case. */
  headers: Record<string, string>;
  body: string;
  finalUrl: string;
}

export interface PageFetcher {
  /** Resolves with any HTTP status; rejects on network errors, timeouts and redirect loops. */
  fetchPage(url: string): Promise<FetchedPage>;
}

/** More than {@link MAX_REDIRECTS} consecutive redirects. */
export class TooManyRedirectsError extends Error {
  constructor(url: string) {
    super(`Too many redirects (> ${MAX_REDIRECTS}) starting at ${url}`);
    this.name = 'TooManyRedirectsError';
  }
}

export interface HttpPageFetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  fetchImpl?: typeof fetch;
}

const REDIRECT_STATUSES = new Set([301, 302, 303, 307, 308]);

function headersToRecord(headers: Headers): Record<string, string> {
  const out: Record<string, string> = {};
  headers.forEach((value, key) => {
    out[key.toLowerCase()] = value;
  });
  return out;
}

/** Reads at most `max` bytes of the body; the rest is dropped and the stream cancelled. */
async function readCapped(res: Response, max: number): Promise<string> {
  if (!res.body) return '';
  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    if (total + value.byteLength > max) {
      chunks.push(value.subarray(0, max - total));
      total = max;
      await reader.cancel();
      break;
    }
    chunks.push(value);
    total += value.byteLength;
  }
  return new TextDecoder('utf-8').decode(Buffer.concat(chunks));
}

/** Plain `fetch` with a timeout, a 1 MB body cap and manual redirect handling (max 5). */
export class HttpPageFetcher implements PageFetcher {
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly doFetch: typeof fetch;

  constructor(options: HttpPageFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? WEBSITE_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 20_000;
    this.maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
    this.doFetch = options.fetchImpl ?? fetch;
  }

  async fetchPage(url: string): Promise<FetchedPage> {
    let current = url;
    for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
      let res: Response;
      try {
        res = await this.doFetch(current, {
          redirect: 'manual',
          headers: { 'User-Agent': this.userAgent, Accept: 'text/html,text/plain;q=0.9,*/*;q=0.5' },
          signal: AbortSignal.timeout(this.timeoutMs),
        });
      } catch (err) {
        throw new HttpError(`Network error for ${current}: ${(err as Error).message}`, 0);
      }
      const location = res.headers.get('location');
      if (REDIRECT_STATUSES.has(res.status) && location) {
        await res.body?.cancel();
        try {
          current = new URL(location, current).toString();
        } catch {
          throw new HttpError(`Invalid redirect location from ${current}`, 502);
        }
        continue;
      }
      let body: string;
      try {
        body = await readCapped(res, this.maxBodyBytes);
      } catch (err) {
        throw new HttpError(`Network error reading ${current}: ${(err as Error).message}`, 0);
      }
      return { status: res.status, headers: headersToRecord(res.headers), body, finalUrl: current };
    }
    throw new TooManyRedirectsError(url);
  }
}

/** Minimal slice of the `playwright-core` API we use, so the build does not need the package. */
export interface PwResponse {
  status(): number;
  headers(): Record<string, string>;
}
export interface PwPage {
  goto(
    url: string,
    options: { timeout: number; waitUntil: 'domcontentloaded' | 'load' },
  ): Promise<PwResponse | null>;
  content(): Promise<string>;
  url(): string;
}
export interface PwContext {
  newPage(): Promise<PwPage>;
  close(): Promise<void>;
}
export interface PwBrowser {
  newContext(options: { userAgent: string }): Promise<PwContext>;
  close(): Promise<void>;
}
export interface PwModule {
  chromium: { launch(options: { headless: boolean }): Promise<PwBrowser> };
}

export interface PlaywrightPageFetcherOptions {
  userAgent?: string;
  timeoutMs?: number;
  maxBodyBytes?: number;
  /** Replaces the dynamic `import('playwright-core')` (tests). */
  loadModule?: () => Promise<PwModule>;
}

async function importPlaywright(): Promise<PwModule> {
  const name = 'playwright-core';
  try {
    return (await import(name)) as PwModule;
  } catch {
    throw new Error(
      'WEBSITE_FETCHER=playwright needs the optional package "playwright-core" and a Chromium ' +
        'install (`npm i playwright-core` and `npx playwright install chromium`)',
    );
  }
}

/** Renders the page in Chromium. `playwright-core` is optional and loaded on first use. */
export class PlaywrightPageFetcher implements PageFetcher {
  private readonly userAgent: string;
  private readonly timeoutMs: number;
  private readonly maxBodyBytes: number;
  private readonly loadModule: () => Promise<PwModule>;
  private browser: Promise<PwBrowser> | null = null;

  constructor(options: PlaywrightPageFetcherOptions = {}) {
    this.userAgent = options.userAgent ?? WEBSITE_USER_AGENT;
    this.timeoutMs = options.timeoutMs ?? 30_000;
    this.maxBodyBytes = options.maxBodyBytes ?? MAX_BODY_BYTES;
    this.loadModule = options.loadModule ?? importPlaywright;
  }

  async fetchPage(url: string): Promise<FetchedPage> {
    const browser = await this.launch();
    const context = await browser.newContext({ userAgent: this.userAgent });
    try {
      const page = await context.newPage();
      let response: PwResponse | null;
      try {
        response = await page.goto(url, { timeout: this.timeoutMs, waitUntil: 'domcontentloaded' });
      } catch (err) {
        throw new HttpError(`Browser error for ${url}: ${(err as Error).message}`, 0);
      }
      if (!response) throw new HttpError(`No response for ${url}`, 0);
      const headers: Record<string, string> = {};
      for (const [k, v] of Object.entries(response.headers())) headers[k.toLowerCase()] = v;
      const html = await page.content();
      return {
        status: response.status(),
        headers,
        body: html.slice(0, this.maxBodyBytes),
        finalUrl: page.url(),
      };
    } finally {
      await context.close();
    }
  }

  async close(): Promise<void> {
    const pending = this.browser;
    this.browser = null;
    if (pending) await (await pending).close();
  }

  private launch(): Promise<PwBrowser> {
    if (!this.browser) {
      const launching = this.loadModule().then((pw) => pw.chromium.launch({ headless: true }));
      this.browser = launching;
      launching.catch(() => {
        if (this.browser === launching) this.browser = null;
      });
    }
    return this.browser;
  }
}
