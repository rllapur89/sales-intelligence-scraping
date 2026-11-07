import { existsSync, readFileSync } from 'node:fs';
import { isAbsolute, resolve } from 'node:path';
import type { CompanyTarget } from '@leads/shared';
import { isRecord, str } from './scraper';

export interface CompaniesConfig {
  greenhouse: CompanyTarget[];
  lever: CompanyTarget[];
}

function parseTargets(list: unknown, section: string): CompanyTarget[] {
  if (list === undefined) return [];
  if (!Array.isArray(list)) throw new Error(`companies config: "${section}" must be an array`);
  const seen = new Set<string>();
  return list.map((entry: unknown, i) => {
    if (!isRecord(entry)) throw new Error(`companies config: ${section}[${i}] must be an object`);
    const slug = str(entry['slug']);
    const name = str(entry['name']);
    const domain = str(entry['domain']);
    if (!slug || !name || !domain) {
      throw new Error(`companies config: ${section}[${i}] needs slug, name and domain`);
    }
    if (seen.has(slug)) throw new Error(`companies config: duplicate slug "${slug}" in ${section}`);
    seen.add(slug);
    return {
      slug,
      name,
      domain,
      industry: str(entry['industry']),
      region: str(entry['region']),
      githubOrg: str(entry['githubOrg']),
      secTicker: str(entry['secTicker']),
    };
  });
}

export function parseCompaniesConfig(raw: unknown): CompaniesConfig {
  if (!isRecord(raw)) throw new Error('companies config must be a JSON object');
  return {
    greenhouse: parseTargets(raw['greenhouse'], 'greenhouse'),
    lever: parseTargets(raw['lever'], 'lever'),
  };
}

/** Workers run from apps/workers under npm workspaces, so try the repo root as well. */
export function resolveConfigPath(configured: string, cwd = process.cwd()): string {
  if (isAbsolute(configured)) return configured;
  const candidates = [resolve(cwd, configured), resolve(cwd, '../..', configured)];
  return candidates.find((p) => existsSync(p)) ?? candidates[0]!;
}

export function loadCompaniesConfig(configured: string): CompaniesConfig {
  const path = resolveConfigPath(configured);
  return parseCompaniesConfig(JSON.parse(readFileSync(path, 'utf8')));
}
