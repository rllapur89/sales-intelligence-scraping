export type JobStatus = 'queued' | 'running' | 'completed' | 'failed' | 'cancelled';

export interface ScrapingJob {
  id: string;
  name: string;
  source: ScrapingSource;
  targetUrl: string;
  depth: number;
  status: JobStatus;
  progress: number;
  leadsFound: number;
  leadsTarget: number;
  errorCount: number;
  startedAt?: Date;
  completedAt?: Date;
  createdAt: Date;
  filters: JobFilter;
  priority: 'low' | 'normal' | 'high';
  estimatedDuration?: number;
}

export type ScrapingSource =
  | 'linkedin'
  | 'company-website'
  | 'industry-directory'
  | 'crunchbase'
  | 'github'
  | 'twitter'
  | 'custom';

export interface JobFilter {
  industries?: string[];
  countries?: string[];
  minEmployees?: number;
  maxEmployees?: number;
  roles?: string[];
}

export interface JobProgress {
  jobId: string;
  progress: number;
  leadsFound: number;
  errorCount: number;
  currentUrl?: string;
  status: JobStatus;
}
