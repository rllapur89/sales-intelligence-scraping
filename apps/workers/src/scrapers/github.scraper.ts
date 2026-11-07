import type { CompanyTarget, RawSignalItem } from '@leads/shared';
import { createJsonFetcher, HttpError, type JsonFetcher } from '../http/http-client';
import { isRecord, str, type Scraper } from './scraper';

export const GITHUB_BASE_URL = 'https://api.github.com';
export const GITHUB_WINDOW_DAYS = 90;
export const GITHUB_MIN_SPACING_MS = 250;
const RELEASE_REPOS = 3;
const DAY_MS = 86_400_000;

export interface GithubScraperOptions {
  /** Token for the `Authorization: Bearer` header. Never logged or stored. */
  token: string;
  userAgent: string;
  /** Replaces the real HTTP fetcher (tests). */
  getJson?: JsonFetcher;
  sleep?: (ms: number) => Promise<void>;
  now?: () => Date;
  baseUrl?: string;
  /** Minimum spacing between requests; never below 250 ms. */
  spacingMs?: number;
}

interface Repo {
  name: string;
  fullName: string;
  createdAt: string;
  pushedAt: string | null;
  language: string | null;
  topics: string[];
  stars: number;
  url: string;
}

interface Release {
  tag: string;
  name: string | null;
  publishedAt: string;
  prerelease: boolean;
  url: string;
}

const defaultSleep = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function validDate(value: unknown): string | null {
  const s = str(value);
  return s && !Number.isNaN(Date.parse(s)) ? s : null;
}

function parseRepo(raw: unknown): Repo | null {
  if (!isRecord(raw)) return null;
  const name = str(raw['name']);
  const fullName = str(raw['full_name']);
  const createdAt = validDate(raw['created_at']);
  const url = str(raw['html_url']);
  if (!name || !fullName || !createdAt || !url) return null;
  return {
    name,
    fullName,
    createdAt,
    pushedAt: validDate(raw['pushed_at']),
    language: str(raw['language']),
    topics: Array.isArray(raw['topics'])
      ? (raw['topics'] as unknown[]).map(str).filter((t): t is string => t !== null)
      : [],
    stars: typeof raw['stargazers_count'] === 'number' ? raw['stargazers_count'] : 0,
    url,
  };
}

function parseRelease(raw: unknown): Release | null {
  if (!isRecord(raw)) return null;
  const tag = str(raw['tag_name']);
  const publishedAt = validDate(raw['published_at']);
  const url = str(raw['html_url']);
  if (!tag || !publishedAt || !url) return null;
  return {
    tag,
    name: str(raw['name']),
    publishedAt,
    prerelease: raw['prerelease'] === true,
    url,
  };
}

/**
 * GitHub REST, org-level metadata only: one repos list plus the releases of the 3 most recently
 * pushed repos (at most 4 sequential requests, spaced >= 250 ms). Emits `oss-activity` signals
 * (`new-repo`, `release`) for the last 90 days. Owner/author logins and emails are never read.
 */
export class GithubScraper implements Scraper {
  readonly source = 'github' as const;
  private readonly getJson: JsonFetcher;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly now: () => Date;
  private readonly baseUrl: string;
  private readonly spacingMs: number;

  constructor(options: GithubScraperOptions) {
    this.getJson =
      options.getJson ??
      createJsonFetcher({
        userAgent: options.userAgent,
        headers: {
          Authorization: `Bearer ${options.token}`,
          Accept: 'application/vnd.github+json',
        },
      });
    this.sleep = options.sleep ?? defaultSleep;
    this.now = options.now ?? (() => new Date());
    this.baseUrl = options.baseUrl ?? GITHUB_BASE_URL;
    this.spacingMs = Math.max(GITHUB_MIN_SPACING_MS, options.spacingMs ?? GITHUB_MIN_SPACING_MS);
  }

  async scrape(target: CompanyTarget): Promise<RawSignalItem[]> {
    const org = target.githubOrg?.trim();
    if (!org) throw new Error(`No githubOrg configured for ${target.slug}`);
    const cutoff = this.now().getTime() - GITHUB_WINDOW_DAYS * DAY_MS;
    const inWindow = (iso: string): boolean => Date.parse(iso) >= cutoff;

    const reposBody = await this.request(
      `${this.baseUrl}/orgs/${encodeURIComponent(org)}/repos?type=public&sort=created&direction=desc&per_page=30`,
      true,
    );
    if (!Array.isArray(reposBody)) {
      throw new HttpError(`Unexpected GitHub response shape for ${org}`, 502);
    }
    const repos = (reposBody as unknown[]).map(parseRepo).filter((r): r is Repo => r !== null);
    const company = {
      name: target.name,
      domain: target.domain,
      industry: target.industry,
      region: target.region,
    };
    const items: RawSignalItem[] = [];

    for (const repo of repos) {
      if (!inWindow(repo.createdAt)) continue;
      items.push({
        company,
        signal: {
          type: 'oss-activity',
          externalId: `gh:${org}:repo:${repo.fullName}`,
          detectedAt: new Date(repo.createdAt).toISOString(),
          payload: {
            kind: 'new-repo',
            name: repo.name,
            fullName: repo.fullName,
            createdAt: repo.createdAt,
            pushedAt: repo.pushedAt,
            language: repo.language,
            topics: repo.topics,
            stars: repo.stars,
            url: repo.url,
          },
        },
      });
    }

    const recent = [...repos]
      .sort((a, b) => Date.parse(b.pushedAt ?? b.createdAt) - Date.parse(a.pushedAt ?? a.createdAt))
      .slice(0, RELEASE_REPOS);
    for (const repo of recent) {
      const body = await this.request(
        `${this.baseUrl}/repos/${repo.fullName}/releases?per_page=5`,
        false,
      );
      if (!Array.isArray(body)) {
        throw new HttpError(`Unexpected GitHub releases shape for ${repo.fullName}`, 502);
      }
      for (const release of (body as unknown[]).map(parseRelease)) {
        if (!release || !inWindow(release.publishedAt)) continue;
        items.push({
          company,
          signal: {
            type: 'oss-activity',
            externalId: `gh:${org}:release:${repo.fullName}:${release.tag}`,
            detectedAt: new Date(release.publishedAt).toISOString(),
            payload: {
              kind: 'release',
              repo: repo.fullName,
              tag: release.tag,
              name: release.name,
              publishedAt: release.publishedAt,
              prerelease: release.prerelease,
              url: release.url,
            },
          },
        });
      }
    }
    return items;
  }

  private async request(url: string, first: boolean): Promise<unknown> {
    if (!first) await this.sleep(this.spacingMs);
    return this.getJson(url);
  }
}
