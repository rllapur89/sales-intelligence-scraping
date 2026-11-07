import type { EventTimings, LeadBatch } from '@leads/shared';
import { Lead } from '../app/core/models/lead.model';
import { ScrapingJob } from '../app/core/models/scraping-job.model';

/** Test factory: a company-centric lead; `company` overrides are merged into the default company. */
export function makeLead(
  overrides: Partial<Omit<Lead, 'company'>> & { company?: Partial<Lead['company']> } = {}
): Lead {
  const { company, ...rest } = overrides;
  const id = rest.id ?? 'lead-1';
  return {
    id,
    score: 80,
    stage: 'new',
    signalTypes: ['hiring'],
    signalCount: 1,
    seq: 1,
    updatedAt: '2024-01-01T00:00:00.000Z',
    ...rest,
    company: {
      id: `company-${id}`,
      domain: `${id}.example.com`,
      name: 'Acme',
      industry: 'Tech',
      region: 'Europe',
      size: 'smb',
      description: null,
      techHints: [],
      ...company,
    },
  };
}

export function makeTimings(overrides: Partial<EventTimings> = {}): EventTimings {
  return { scrapedAt: 1000, ingestedAt: 1100, publishedAt: 1200, ...overrides };
}

export function makeBatch(leads: Lead[], fromSeq?: number, toSeq?: number): LeadBatch {
  const seqs = leads.map(l => l.seq);
  return {
    fromSeq: fromSeq ?? Math.min(...seqs),
    toSeq: toSeq ?? Math.max(...seqs),
    leads,
    timings: Object.fromEntries(leads.map(l => [l.id, makeTimings()])),
  };
}

export function makeJob(overrides: Partial<ScrapingJob> = {}): ScrapingJob {
  return {
    id: 'job-1',
    name: 'Test Job',
    source: 'greenhouse',
    status: 'queued',
    progress: 0,
    leadsFound: 0,
    errorCount: 0,
    errors: [],
    createdAt: new Date('2024-01-01'),
    ...overrides,
  };
}
