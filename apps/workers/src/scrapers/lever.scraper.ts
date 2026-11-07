import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import type { JsonFetcher } from '../http/http-client';
import { HttpError } from '../http/http-client';
import { isRecord, str, type Scraper } from './scraper';

export const LEVER_BASE_URL = 'https://api.lever.co/v0/postings';

/**
 * Lever public Postings API: GET /v0/postings/{site}?mode=json. No auth. Descriptions and lists are
 * ignored: we keep title, team and location per posting as one `hiring` signal.
 */
export class LeverScraper implements Scraper {
  readonly source = 'lever' as const;

  constructor(
    private readonly getJson: JsonFetcher,
    private readonly baseUrl: string = LEVER_BASE_URL,
  ) {}

  async scrape(target: CompanyTarget): Promise<RawSignalItem[]> {
    const body = await this.getJson(`${this.baseUrl}/${encodeURIComponent(target.slug)}?mode=json`);
    if (!Array.isArray(body)) {
      throw new HttpError(`Unexpected Lever response shape for ${target.slug}`, 502);
    }
    const items: RawSignalItem[] = [];
    for (const posting of body as unknown[]) {
      if (!isRecord(posting)) continue;
      const id = str(posting['id']);
      const title = str(posting['text']);
      const createdAt = posting['createdAt'];
      if (!id || !title || typeof createdAt !== 'number' || !Number.isFinite(createdAt)) continue;
      const categories = isRecord(posting['categories']) ? posting['categories'] : {};
      items.push({
        company: {
          name: target.name,
          domain: target.domain,
          industry: target.industry,
          region: target.region,
        },
        signal: {
          type: 'hiring',
          externalId: `lever:${target.slug}:${id}`,
          detectedAt: new Date(createdAt).toISOString(),
          payload: {
            title,
            team: str(categories['team']),
            department: str(categories['department']),
            location: str(categories['location']),
            commitment: str(categories['commitment']),
            workplaceType: str(posting['workplaceType']),
            url: str(posting['hostedUrl']),
          },
        },
      });
    }
    return items;
  }
}
