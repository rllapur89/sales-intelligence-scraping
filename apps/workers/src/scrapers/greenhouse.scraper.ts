import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import type { JsonFetcher } from '../http/http-client';
import { HttpError } from '../http/http-client';
import { isRecord, str, type Scraper } from './scraper';

export const GREENHOUSE_BASE_URL = 'https://boards-api.greenhouse.io/v1/boards';

/**
 * Greenhouse public job board: GET /v1/boards/{token}/jobs. No auth. We keep only job metadata
 * (no description, no applicant data) and emit one `hiring` signal per open job.
 */
export class GreenhouseScraper implements Scraper {
  readonly source = 'greenhouse' as const;

  constructor(
    private readonly getJson: JsonFetcher,
    private readonly baseUrl: string = GREENHOUSE_BASE_URL,
  ) {}

  async scrape(target: CompanyTarget): Promise<RawSignalItem[]> {
    const body = await this.getJson(`${this.baseUrl}/${encodeURIComponent(target.slug)}/jobs`);
    if (!isRecord(body) || !Array.isArray(body['jobs'])) {
      throw new HttpError(`Unexpected Greenhouse response shape for ${target.slug}`, 502);
    }
    const items: RawSignalItem[] = [];
    for (const job of body['jobs'] as unknown[]) {
      if (!isRecord(job)) continue;
      const id = job['id'];
      const title = str(job['title']);
      if ((typeof id !== 'number' && typeof id !== 'string') || !title) continue;
      const published = str(job['first_published']) ?? str(job['updated_at']);
      const detectedAt = published ? new Date(published) : null;
      if (!detectedAt || Number.isNaN(detectedAt.getTime())) continue;
      const location = isRecord(job['location']) ? str(job['location']['name']) : null;
      items.push({
        company: {
          name: target.name,
          domain: target.domain,
          industry: target.industry,
          region: target.region,
        },
        signal: {
          type: 'hiring',
          externalId: `gh:${target.slug}:${String(id)}`,
          detectedAt: detectedAt.toISOString(),
          payload: {
            title,
            location,
            url: str(job['absolute_url']),
            updatedAt: str(job['updated_at']),
          },
        },
      });
    }
    return items;
  }
}
