import { Injectable } from '@angular/core';
import {
  CompanySize,
  PIPELINE_STAGES,
  type PipelineStage,
  SIGNAL_TYPES,
  SOURCE_KEYS,
  type SignalType,
  type SourceKey,
} from '@leads/shared';
import { Lead } from '../models/lead.model';
import { ScrapingJob, JobStatus } from '../models/scraping-job.model';
import { ActivityEvent, ChartPoint } from '../models/metrics.model';

const COMPANIES = [
  'TechNova', 'Apex Systems', 'CloudForge', 'DataStream', 'NexGen Solutions',
  'Vertex Corp', 'InnovateCo', 'Synergy Digital', 'PivotPoint', 'AlphaStack',
  'Meridian Labs', 'CoreLogic', 'SkyBridge Tech', 'Quantum Analytics', 'BlueShift',
  'Orion Ventures', 'ClearPath AI', 'FrontierSoft', 'Elevation Works', 'TrueScale',
  'RapidGrid', 'Momentum Tech', 'LiftOff Digital', 'Circadian', 'Starflow',
  'PulseMetrics', 'NorthStar Data', 'EchoSystems', 'BrightPath', 'Vantage Point',
];
const INDUSTRIES = [
  'Technology', 'Healthcare', 'Finance', 'Retail', 'Manufacturing', 'Education',
  'Real Estate', 'Legal', 'Marketing', 'Consulting', 'Energy', 'Logistics',
];
const REGIONS = ['North America', 'Europe', 'Latin America', 'Asia Pacific', 'Middle East', 'Remote'];
const TECH_HINTS = [
  'React', 'Angular', 'Vue', 'Node.js', 'Python', 'AWS', 'Azure', 'GCP', 'Kubernetes',
  'PostgreSQL', 'MongoDB', 'Redis', 'Docker', 'Terraform', 'TypeScript',
];
const SIZES: CompanySize[] = ['startup', 'smb', 'mid-market', 'enterprise'];
/** Sources the mock mode simulates (the ones with a reviewed policy plus a few more). */
const MOCK_SOURCES: SourceKey[] = ['greenhouse', 'lever', 'github', 'hn-hiring', 'remoteok'];

function rand<T>(arr: readonly T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function randInt(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function uuid(): string {
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}
function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
}
function pickSignalTypes(): SignalType[] {
  const count = randInt(1, 3);
  const picked = new Set<SignalType>();
  while (picked.size < count) picked.add(rand(SIGNAL_TYPES));
  return [...picked];
}

let seqCounter = 0;

export function generateLead(index: number): Lead {
  const name = rand(COMPANIES);
  const signalTypes = pickSignalTypes();
  seqCounter += 1;
  return {
    id: `lead-${index}-${uuid()}`,
    company: {
      id: `company-${index}-${uuid()}`,
      name,
      domain: `${slugify(name)}-${index}.com`,
      industry: rand(INDUSTRIES),
      region: rand(REGIONS),
      size: rand(SIZES),
      description: null,
      techHints: Array.from(new Set(Array.from({ length: randInt(1, 4) }, () => rand(TECH_HINTS)))),
    },
    score: randInt(40, 100),
    stage: rand(PIPELINE_STAGES),
    signalTypes,
    signalCount: signalTypes.length + randInt(0, 6),
    seq: seqCounter,
    updatedAt: new Date(Date.now() - randInt(0, 7 * 24 * 3600 * 1000)).toISOString(),
  };
}

function generateJob(index: number): ScrapingJob {
  const statuses: JobStatus[] = ['queued', 'running', 'running', 'completed', 'completed', 'failed'];
  const status = rand(statuses);
  const progress =
    status === 'completed' ? 100 : status === 'running' ? randInt(5, 95) : status === 'failed' ? randInt(10, 60) : 0;
  const source = rand(MOCK_SOURCES);
  const errorCount = randInt(0, 12);

  return {
    id: `job-${index}-${uuid()}`,
    name: `${source} scrape #${index + 1}`,
    source,
    status,
    progress,
    leadsFound: randInt(10, 5000),
    errorCount,
    errors: Array.from({ length: Math.min(errorCount, 3) }, (_, i) => `Request ${i + 1} failed (HTTP 503)`),
    startedAt: status !== 'queued' ? new Date(Date.now() - randInt(60000, 3600000)) : undefined,
    completedAt:
      status === 'completed' || status === 'failed' ? new Date(Date.now() - randInt(0, 1800000)) : undefined,
    createdAt: new Date(Date.now() - randInt(0, 7 * 24 * 3600 * 1000)),
  };
}

@Injectable({ providedIn: 'root' })
export class MockDataService {
  private readonly _leads: Lead[] = Array.from({ length: 1200 }, (_, i) => generateLead(i));
  private readonly _jobs: ScrapingJob[] = Array.from({ length: 24 }, (_, i) => generateJob(i));

  getLeads(): Lead[] {
    return this._leads;
  }
  getJobs(): ScrapingJob[] {
    return this._jobs;
  }

  getActiveJobs(): ScrapingJob[] {
    return this._jobs.filter(j => j.status === 'running' || j.status === 'queued');
  }

  getRecentActivity(): ActivityEvent[] {
    return Array.from({ length: 40 }, (_, i): ActivityEvent => {
      const types: ActivityEvent['type'][] = ['lead_found', 'lead_found', 'job_started', 'job_completed', 'job_failed'];
      const type = rand(types);
      const source = rand(MOCK_SOURCES);
      const msgs: Record<ActivityEvent['type'], string> = {
        lead_found: `Found ${randInt(5, 150)} signals at ${rand(COMPANIES)}`,
        job_started: `Job "${source}" started`,
        job_completed: `Job "${source}" completed with ${randInt(100, 5000)} items`,
        job_failed: `Job "${source}" failed at ${randInt(10, 80)}%`,
        export: `Exported ${randInt(100, 5000)} leads to CSV`,
      };
      return {
        id: `evt-${i}`,
        type,
        message: msgs[type],
        timestamp: new Date(Date.now() - i * randInt(30000, 300000)),
        meta: { count: randInt(5, 5000), source },
      };
    });
  }

  getHourlyChart(): ChartPoint[] {
    return Array.from({ length: 24 }, (_, i) => ({
      label: `${String(i).padStart(2, '0')}:00`,
      value: randInt(0, 800),
    }));
  }

  getIndustries(): string[] {
    return INDUSTRIES;
  }
  getRegions(): string[] {
    return REGIONS;
  }
  getSources(): readonly SourceKey[] {
    return SOURCE_KEYS;
  }

  updateJobProgress(job: ScrapingJob): ScrapingJob {
    const newProgress = Math.min(100, job.progress + randInt(1, 8));
    const done = newProgress >= 100;
    return {
      ...job,
      progress: newProgress,
      leadsFound: job.leadsFound + randInt(5, 80),
      errorCount: job.errorCount + (Math.random() > 0.9 ? 1 : 0),
      status: done ? 'completed' : 'running',
      completedAt: done ? new Date() : undefined,
    };
  }

  generateNewLead(): Lead {
    return generateLead(this._leads.length + randInt(0, 9999));
  }

  /** A new company-centric lead typed by the user (mock mode only). */
  createLead(input: {
    name: string;
    domain: string;
    industry: string;
    region: string;
    size: CompanySize;
    stage: PipelineStage;
  }): Lead {
    seqCounter += 1;
    return {
      id: `lead-${crypto.randomUUID()}`,
      company: {
        id: `company-${crypto.randomUUID()}`,
        name: input.name,
        domain: input.domain,
        industry: input.industry,
        region: input.region,
        size: input.size,
        description: null,
        techHints: [],
      },
      score: randInt(50, 89),
      stage: input.stage,
      signalTypes: [],
      signalCount: 0,
      seq: seqCounter,
      updatedAt: new Date().toISOString(),
    };
  }

  /** A fresh version of an existing lead (new seq/updatedAt), as a re-scrape would produce. */
  refreshLead(lead: Lead): Lead {
    seqCounter += 1;
    return {
      ...lead,
      score: Math.min(100, Math.max(0, lead.score + randInt(-5, 10))),
      signalCount: lead.signalCount + randInt(0, 2),
      seq: Math.max(seqCounter, lead.seq + 1),
      updatedAt: new Date().toISOString(),
    };
  }
}
