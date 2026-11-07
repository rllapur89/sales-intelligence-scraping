/**
 * Domain DTOs. Dates travel as ISO-8601 strings. Leads are COMPANIES with buying signals;
 * the platform never stores personal data (names, personal emails, phone numbers).
 */
import type { SourceKey } from './sources';

export const SIGNAL_TYPES = [
  'hiring',
  'filing',
  'oss-activity',
  'funding',
  'website-tech',
] as const;
export type SignalType = (typeof SIGNAL_TYPES)[number];

export const PIPELINE_STAGES = [
  'new',
  'contacted',
  'qualified',
  'proposal',
  'won',
  'lost',
] as const;
export type PipelineStage = (typeof PIPELINE_STAGES)[number];

export const JOB_STATUSES = ['queued', 'running', 'completed', 'failed', 'cancelled'] as const;
export type JobStatus = (typeof JOB_STATUSES)[number];

export type CompanySize = 'startup' | 'smb' | 'mid-market' | 'enterprise';

export interface CompanyDto {
  id: string;
  /** Normalized registrable domain, the company identity key. */
  domain: string;
  name: string;
  industry: string | null;
  region: string | null;
  size: CompanySize | null;
  description: string | null;
  techHints: string[];
}

export interface SignalDto {
  id: string;
  companyId: string;
  type: SignalType;
  source: SourceKey;
  payload: Record<string, unknown>;
  detectedAt: string;
  scrapedAt: string;
}

export interface LeadDto {
  id: string;
  company: CompanyDto;
  /** Aggregated score, 0-100. */
  score: number;
  stage: PipelineStage;
  signalTypes: SignalType[];
  signalCount: number;
  /** Sequence number of the last event that touched this lead. */
  seq: number;
  updatedAt: string;
}

export interface ScrapingJobDto {
  id: string;
  name: string;
  source: SourceKey;
  status: JobStatus;
  progress: number;
  itemsFound: number;
  errorCount: number;
  errors: string[];
  startedAt: string | null;
  completedAt: string | null;
  durationMs: number | null;
  createdAt: string;
}

/** Per-user filter. Empty arrays mean "any". */
export interface SubscriptionFilter {
  industries: string[];
  regions: string[];
  signalTypes: SignalType[];
  minScore: number;
}

export interface SubscriptionDto {
  id: string;
  name: string;
  active: boolean;
  filter: SubscriptionFilter;
}

/** Keyset pagination envelope. `nextCursor` is opaque; null means last page. */
export interface Page<T> {
  items: T[];
  nextCursor: string | null;
}

export type UserRole = 'admin' | 'user';

export interface AuthUserDto {
  id: string;
  email: string;
  displayName: string;
  role: UserRole;
}

export interface AuthResponse {
  accessToken: string;
  refreshToken: string;
  user: AuthUserDto;
}
