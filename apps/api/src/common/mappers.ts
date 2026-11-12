import type { Company, Lead, ScrapingJob, Signal, Source, $Enums } from '@leads/db';
import {
  fromDbSourceKey,
  toCompanyDto as sharedToCompanyDto,
  toLeadDto as sharedToLeadDto,
  type CompanyDto,
  type CompanySize,
  type JobStatus,
  type LeadDto,
  type PipelineStage,
  type ScrapingJobDto,
  type SignalDto,
  type SignalType,
} from '@leads/shared';

type DbStage = $Enums.PipelineStage;
type DbSignalType = $Enums.SignalType;
type DbJobStatus = $Enums.JobStatus;
type DbSize = $Enums.CompanySize;

const STAGE_TO_DB: Record<PipelineStage, DbStage> = {
  new: 'NEW',
  contacted: 'CONTACTED',
  qualified: 'QUALIFIED',
  proposal: 'PROPOSAL',
  won: 'WON',
  lost: 'LOST',
};

const SIGNAL_TO_DB: Record<SignalType, DbSignalType> = {
  hiring: 'HIRING',
  filing: 'FILING',
  'oss-activity': 'OSS_ACTIVITY',
  funding: 'FUNDING',
  'website-tech': 'WEBSITE_TECH',
};

const STATUS_TO_DB: Record<JobStatus, DbJobStatus> = {
  queued: 'QUEUED',
  running: 'RUNNING',
  completed: 'COMPLETED',
  failed: 'FAILED',
  cancelled: 'CANCELLED',
};

const SIZE_TO_DB: Record<CompanySize, DbSize> = {
  startup: 'STARTUP',
  smb: 'SMB',
  'mid-market': 'MID_MARKET',
  enterprise: 'ENTERPRISE',
};

function invert<K extends string, V extends string>(map: Record<K, V>): Record<V, K> {
  const out = {} as Record<V, K>;
  for (const key of Object.keys(map) as K[]) out[map[key]] = key;
  return out;
}

const STAGE_FROM_DB = invert(STAGE_TO_DB);
const SIGNAL_FROM_DB = invert(SIGNAL_TO_DB);
const STATUS_FROM_DB = invert(STATUS_TO_DB);
const SIZE_FROM_DB = invert(SIZE_TO_DB);

export const toDbStage = (s: PipelineStage): DbStage => STAGE_TO_DB[s];
export const fromDbStage = (s: DbStage): PipelineStage => STAGE_FROM_DB[s];
export const toDbSignalType = (s: SignalType): DbSignalType => SIGNAL_TO_DB[s];
export const fromDbSignalType = (s: DbSignalType): SignalType => SIGNAL_FROM_DB[s];
export const toDbJobStatus = (s: JobStatus): DbJobStatus => STATUS_TO_DB[s];
export const fromDbJobStatus = (s: DbJobStatus): JobStatus => STATUS_FROM_DB[s];
export const toDbSize = (s: CompanySize): DbSize => SIZE_TO_DB[s];
export const fromDbSize = (s: DbSize): CompanySize => SIZE_FROM_DB[s];

export const toCompanyDto = (company: Company): CompanyDto => sharedToCompanyDto(company);

export const toLeadDto = (lead: Lead & { company: Company }): LeadDto =>
  sharedToLeadDto(lead, lead.company);

export function toSignalDto(signal: Signal & { source: Source }): SignalDto {
  return {
    id: signal.id,
    companyId: signal.companyId,
    type: fromDbSignalType(signal.type),
    source: fromDbSourceKey(signal.source.key),
    payload: (signal.payload ?? {}) as Record<string, unknown>,
    detectedAt: signal.detectedAt.toISOString(),
    scrapedAt: signal.scrapedAt.toISOString(),
  };
}

export function toErrorList(errors: unknown): string[] {
  return Array.isArray(errors) ? errors.filter((e): e is string => typeof e === 'string') : [];
}

export function toJobDto(job: ScrapingJob & { source: Source }): ScrapingJobDto {
  return {
    id: job.id,
    name: job.name,
    source: fromDbSourceKey(job.source.key),
    status: fromDbJobStatus(job.status),
    progress: job.progress,
    itemsFound: job.itemsFound,
    errorCount: job.errorCount,
    errors: toErrorList(job.errors),
    startedAt: job.startedAt?.toISOString() ?? null,
    completedAt: job.completedAt?.toISOString() ?? null,
    durationMs: job.durationMs,
    createdAt: job.createdAt.toISOString(),
  };
}
