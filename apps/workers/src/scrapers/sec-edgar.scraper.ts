import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import { HttpError, type JsonFetcher } from '../http/http-client';
import { isRecord, str, type Scraper } from './scraper';

export const SEC_TICKERS_URL = 'https://www.sec.gov/files/company_tickers.json';
export const SEC_SUBMISSIONS_BASE_URL = 'https://data.sec.gov/submissions';
export const SEC_WINDOW_DAYS = 90;
export const SEC_TICKER_CACHE_MS = 24 * 60 * 60 * 1000;
const DAY_MS = 86_400_000;

/** Issuer-level forms only. Insider forms (3, 4, 5, SC 13D/G...) are never stored. */
export const SEC_FORM_ALLOWLIST: ReadonlySet<string> = new Set([
  '8-K',
  '10-K',
  '10-K/A',
  '10-Q',
  'S-1',
  'S-1/A',
  '424B4',
  '6-K',
  '20-F',
]);

export interface SecEdgarScraperOptions {
  /** Fetcher that already sends the SEC `User-Agent` (and `Accept-Encoding`). */
  getJson: JsonFetcher;
  now?: () => Date;
  tickersUrl?: string;
  submissionsBaseUrl?: string;
}

interface TickerEntry {
  cik: number;
  title: string;
}

/** Corporate suffixes and filler words that carry no identity. */
const STOP_WORDS = new Set([
  'the',
  'inc',
  'incorporated',
  'corp',
  'corporation',
  'co',
  'company',
  'ltd',
  'limited',
  'plc',
  'llc',
  'nv',
  'sa',
  'ag',
  'holdings',
  'holding',
  'group',
]);

function tokens(name: string): string[] {
  return name
    .toLowerCase()
    .replace(/&/g, ' and ')
    .replace(/[^a-z0-9]+/g, ' ')
    .split(' ')
    .filter((t) => t !== '');
}

/** Loose match: the first significant token of the configured name appears in the EDGAR title. */
export function nameMatches(configured: string, edgarTitle: string): boolean {
  const first = tokens(configured).find((t) => !STOP_WORDS.has(t)) ?? tokens(configured)[0];
  if (!first) return false;
  const titleTokens = tokens(edgarTitle);
  return titleTokens.some((t) => t === first) || titleTokens.join('').includes(first);
}

export function padCik(cik: number | string): string {
  return String(cik)
    .replace(/^0+(?=\d)/, '')
    .padStart(10, '0');
}

/**
 * SEC EDGAR filings: resolves `secTicker` to a CIK through the cached ticker map (one fetch per
 * 24 h), then reads `submissions/CIK##########.json`. Emits `filing` signals for issuer-level forms
 * of the last 90 days. 403/429 propagate as `HttpError` so the caller can pause the queue.
 */
export class SecEdgarScraper implements Scraper {
  readonly source = 'sec-edgar' as const;
  private readonly getJson: JsonFetcher;
  private readonly now: () => Date;
  private readonly tickersUrl: string;
  private readonly submissionsBaseUrl: string;
  private cache: { loadedAt: number; map: Promise<Map<string, TickerEntry>> } | null = null;

  constructor(options: SecEdgarScraperOptions) {
    this.getJson = options.getJson;
    this.now = options.now ?? (() => new Date());
    this.tickersUrl = options.tickersUrl ?? SEC_TICKERS_URL;
    this.submissionsBaseUrl = options.submissionsBaseUrl ?? SEC_SUBMISSIONS_BASE_URL;
  }

  async scrape(target: CompanyTarget): Promise<RawSignalItem[]> {
    const ticker = target.secTicker?.trim().toUpperCase();
    if (!ticker) throw new Error(`No secTicker configured for ${target.slug}`);

    const entry = (await this.tickerMap()).get(ticker);
    if (!entry) {
      throw new HttpError(`SEC ticker ${ticker} not found in company_tickers.json`, 422);
    }
    if (!nameMatches(target.name, entry.title)) {
      throw new HttpError(
        `SEC ticker ${ticker} resolves to "${entry.title}", which does not match configured company "${target.name}"; skipped`,
        422,
      );
    }

    const body = await this.getJson(`${this.submissionsBaseUrl}/CIK${padCik(entry.cik)}.json`);
    const recent = isRecord(body) && isRecord(body['filings']) ? body['filings']['recent'] : null;
    if (!isRecord(recent)) {
      throw new HttpError(`Unexpected SEC submissions shape for ${ticker}`, 502);
    }
    const col = (key: string): unknown[] => {
      const v = recent[key];
      return Array.isArray(v) ? (v as unknown[]) : [];
    };
    const forms = col('form');
    const dates = col('filingDate');
    const accessions = col('accessionNumber');
    const docs = col('primaryDocument');

    const cutoff = this.now().getTime() - SEC_WINDOW_DAYS * DAY_MS;
    const cik = String(entry.cik);
    const company = {
      name: target.name,
      domain: target.domain,
      industry: target.industry,
      region: target.region,
    };
    const items: RawSignalItem[] = [];
    for (let i = 0; i < forms.length; i++) {
      const form = str(forms[i]);
      const filingDate = str(dates[i]);
      const accession = str(accessions[i]);
      const doc = str(docs[i]);
      if (!form || !filingDate || !accession || !doc) continue;
      if (!SEC_FORM_ALLOWLIST.has(form)) continue;
      const time = Date.parse(filingDate);
      if (Number.isNaN(time) || time < cutoff) continue;
      items.push({
        company,
        signal: {
          type: 'filing',
          externalId: `sec:${cik}:${accession}`,
          detectedAt: new Date(time).toISOString(),
          payload: {
            form,
            filingDate,
            url: `https://www.sec.gov/Archives/edgar/data/${cik}/${accession.replace(/-/g, '')}/${doc}`,
          },
        },
      });
    }
    return items;
  }

  /** Ticker -> CIK map, fetched once and reused for 24 h. A failed fetch is not cached. */
  private tickerMap(): Promise<Map<string, TickerEntry>> {
    const nowMs = this.now().getTime();
    if (this.cache && nowMs - this.cache.loadedAt < SEC_TICKER_CACHE_MS) return this.cache.map;
    const map = this.loadTickers();
    const entry = { loadedAt: nowMs, map };
    this.cache = entry;
    map.catch(() => {
      if (this.cache === entry) this.cache = null;
    });
    return map;
  }

  private async loadTickers(): Promise<Map<string, TickerEntry>> {
    const body = await this.getJson(this.tickersUrl);
    if (!isRecord(body)) throw new HttpError('Unexpected SEC company_tickers.json shape', 502);
    const map = new Map<string, TickerEntry>();
    for (const raw of Object.values(body)) {
      if (!isRecord(raw)) continue;
      const ticker = str(raw['ticker']);
      const title = str(raw['title']);
      const cik = raw['cik_str'];
      if (!ticker || !title || typeof cik !== 'number') continue;
      map.set(ticker.toUpperCase(), { cik, title });
    }
    return map;
  }
}
