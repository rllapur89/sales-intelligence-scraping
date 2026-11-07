import type { JobStatus, ScrapingJobDto, SourceKey } from '@leads/shared';

export type { JobStatus };
export type ScrapingSource = SourceKey;

export interface ScrapingJob {
  id: string;
  name: string;
  source: SourceKey;
  status: JobStatus;
  progress: number;
  /** Items (signals) found so far; `itemsFound` in the API. */
  leadsFound: number;
  errorCount: number;
  errors: string[];
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
}

export interface JobProgress {
  jobId: string;
  progress: number;
  leadsFound: number;
  errorCount: number;
  status: JobStatus;
}

/** Maps the API representation (ISO strings) to the client model (Dates). */
export function toScrapingJob(dto: ScrapingJobDto): ScrapingJob {
  return {
    id: dto.id,
    name: dto.name,
    source: dto.source,
    status: dto.status,
    progress: dto.progress,
    leadsFound: dto.itemsFound,
    errorCount: dto.errorCount,
    errors: dto.errors,
    startedAt: dto.startedAt ? new Date(dto.startedAt) : undefined,
    completedAt: dto.completedAt ? new Date(dto.completedAt) : undefined,
    createdAt: new Date(dto.createdAt),
  };
}
