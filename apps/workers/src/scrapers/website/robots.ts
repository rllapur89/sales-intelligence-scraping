import { TooManyRedirectsError, type PageFetcher } from './page-fetcher';

/** Product token we match in `User-Agent` lines (case-insensitive, RFC 9309 2.2.1). */
export const ROBOTS_PRODUCT_TOKEN = 'LeadsSalesIntelligenceBot';
export const ROBOTS_CACHE_MS = 24 * 60 * 60 * 1000;

export interface RobotsRule {
  allow: boolean;
  path: string;
}

interface RobotsGroup {
  agents: string[];
  rules: RobotsRule[];
  crawlDelaySec?: number;
}

export interface ParsedRobots {
  groups: RobotsGroup[];
}

/** Rules that apply to us after group selection and merging. */
export interface RobotsRules {
  rules: RobotsRule[];
  crawlDelaySec?: number;
}

/** Parses robots.txt text. Unknown lines, comments and `Sitemap` are ignored. */
export function parseRobots(text: string): ParsedRobots {
  const groups: RobotsGroup[] = [];
  let current: RobotsGroup | null = null;
  let collectingAgents = false;

  for (const rawLine of text.replace(/^\uFEFF/, '').split(/\r\n|\n|\r/)) {
    const line = rawLine.replace(/#.*$/, '').trim();
    const colon = line.indexOf(':');
    if (colon < 0) continue;
    const key = line.slice(0, colon).trim().toLowerCase();
    const value = line.slice(colon + 1).trim();

    if (key === 'user-agent') {
      if (!current || !collectingAgents) {
        current = { agents: [], rules: [] };
        groups.push(current);
      }
      collectingAgents = true;
      current.agents.push(value.toLowerCase());
    } else if (key === 'allow' || key === 'disallow') {
      collectingAgents = false;
      // Rules before any User-agent line belong to no group and are ignored.
      current?.rules.push({ allow: key === 'allow', path: value });
    } else if (key === 'crawl-delay') {
      collectingAgents = false;
      const n = Number(value);
      if (current && Number.isFinite(n) && n >= 0 && current.crawlDelaySec === undefined) {
        current.crawlDelaySec = n;
      }
    }
  }
  return { groups };
}

/**
 * Group selection (RFC 9309 2.2.1): every group naming our product token is merged; when none
 * does, the `*` groups are merged; otherwise there are no rules (everything allowed).
 */
export function selectRules(
  parsed: ParsedRobots,
  productToken: string = ROBOTS_PRODUCT_TOKEN,
): RobotsRules {
  const token = productToken.toLowerCase();
  let matching = parsed.groups.filter((g) => g.agents.includes(token));
  if (matching.length === 0) matching = parsed.groups.filter((g) => g.agents.includes('*'));
  const rules = matching.flatMap((g) => g.rules);
  const delay = matching.find((g) => g.crawlDelaySec !== undefined)?.crawlDelaySec;
  return delay === undefined ? { rules } : { rules, crawlDelaySec: delay };
}

function patternToRegExp(pattern: string): RegExp {
  const anchored = pattern.endsWith('$');
  const body = anchored ? pattern.slice(0, -1) : pattern;
  const source = body
    .split('*')
    .map((part) => part.replace(/[.+?^${}()|[\]\\/]/g, '\\$&'))
    .join('.*');
  return new RegExp(`^${source}${anchored ? '$' : ''}`);
}

/**
 * Whether `path` (with query, starting with `/`) may be fetched. Longest matching rule wins,
 * Allow wins a tie, an empty `Disallow` allows everything, no match allows.
 * `/robots.txt` is always allowed.
 */
export function isPathAllowed(rules: RobotsRule[], path: string): boolean {
  if (path === '/robots.txt') return true;
  let best: { length: number; allow: boolean } | null = null;
  for (const rule of rules) {
    if (rule.path === '') continue;
    if (!patternToRegExp(rule.path).test(path)) continue;
    const length = rule.path.length;
    if (!best || length > best.length || (length === best.length && rule.allow && !best.allow)) {
      best = { length, allow: rule.allow };
    }
  }
  return best ? best.allow : true;
}

export type RobotsPolicyKind = 'rules' | 'allow-all' | 'disallow-all';

export interface RobotsPolicy {
  kind: RobotsPolicyKind;
  rules: RobotsRule[];
  crawlDelaySec?: number;
  /** Human readable origin of the policy, for logs and skip reasons. */
  reason: string;
}

/**
 * Policy for a robots.txt fetch outcome:
 * 2xx parse; 4xx (unavailable) allow all; 5xx or network error assume full disallow;
 * more than 5 redirects treated as unreachable, so we stay out (conservative).
 */
export function policyFromStatus(status: number, body: string): RobotsPolicy {
  if (status >= 200 && status < 300) {
    const selected = selectRules(parseRobots(body));
    return { kind: 'rules', ...selected, reason: `robots.txt HTTP ${status}` };
  }
  if (status >= 400 && status < 500) {
    return { kind: 'allow-all', rules: [], reason: `robots.txt HTTP ${status} (no restrictions)` };
  }
  return {
    kind: 'disallow-all',
    rules: [],
    reason: `robots.txt HTTP ${status} (server error, assuming full disallow)`,
  };
}

export interface RobotsCheckerOptions {
  /** Must follow redirects up to 5 and reject with `TooManyRedirectsError` beyond that. */
  fetcher: PageFetcher;
  now?: () => number;
  ttlMs?: number;
}

/** Fetches and caches robots.txt per host (24 h) and answers allow/deny questions. */
export class RobotsChecker {
  private readonly fetcher: PageFetcher;
  private readonly now: () => number;
  private readonly ttlMs: number;
  private readonly cache = new Map<string, { policy: RobotsPolicy; expiresAt: number }>();

  constructor(options: RobotsCheckerOptions) {
    this.fetcher = options.fetcher;
    this.now = options.now ?? Date.now;
    this.ttlMs = Math.min(options.ttlMs ?? ROBOTS_CACHE_MS, ROBOTS_CACHE_MS);
  }

  async getPolicy(host: string): Promise<RobotsPolicy> {
    const key = host.toLowerCase();
    const hit = this.cache.get(key);
    if (hit && hit.expiresAt > this.now()) return hit.policy;
    const policy = await this.load(key);
    this.cache.set(key, { policy, expiresAt: this.now() + this.ttlMs });
    return policy;
  }

  async isAllowed(host: string, path: string): Promise<boolean> {
    const policy = await this.getPolicy(host);
    if (policy.kind === 'allow-all') return true;
    if (policy.kind === 'disallow-all') return path === '/robots.txt';
    return isPathAllowed(policy.rules, path);
  }

  private async load(host: string): Promise<RobotsPolicy> {
    try {
      const res = await this.fetcher.fetchPage(`https://${host}/robots.txt`);
      return policyFromStatus(res.status, res.body);
    } catch (err) {
      if (err instanceof TooManyRedirectsError) {
        return {
          kind: 'disallow-all',
          rules: [],
          reason: 'robots.txt unavailable: too many redirects (> 5)',
        };
      }
      return {
        kind: 'disallow-all',
        rules: [],
        reason: `robots.txt unreachable (${(err as Error).message}), assuming full disallow`,
      };
    }
  }
}
