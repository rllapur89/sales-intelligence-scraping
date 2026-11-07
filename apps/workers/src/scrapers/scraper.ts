import type { CompanyTarget, RawSignalItem, SourceKey } from '@leads/shared';

export interface Scraper {
  readonly source: SourceKey;
  /** Fetches one target (one HTTP request) and maps it to signals. Must be idempotent. */
  scrape(target: CompanyTarget): Promise<RawSignalItem[]>;
}

export function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

export function str(value: unknown): string | null {
  return typeof value === 'string' && value.trim() !== '' ? value.trim() : null;
}
