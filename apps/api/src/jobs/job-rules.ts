import {
  BadRequestException,
  ConflictException,
  ServiceUnavailableException,
} from '@nestjs/common';
import {
  SOURCE_POLICIES,
  type JobStatus,
  type ScrapeTaskData,
  type SourceKey,
} from '@leads/shared';

const CANCELLABLE: readonly JobStatus[] = ['queued', 'running'];
const RETRYABLE: readonly JobStatus[] = ['failed', 'cancelled'];

export const canCancel = (status: JobStatus): boolean => CANCELLABLE.includes(status);
export const canRetry = (status: JobStatus): boolean => RETRYABLE.includes(status);

export function assertCancellable(status: JobStatus): void {
  if (!canCancel(status)) {
    throw new ConflictException(`Cannot cancel a job in status "${status}"`);
  }
}

export function assertRetryable(status: JobStatus): void {
  if (!canRetry(status)) {
    throw new ConflictException(`Cannot retry a job in status "${status}"`);
  }
}

/** Workers refuse unreviewed sources, so the API refuses to enqueue them. */
export function assertSourceReviewed(source: SourceKey): void {
  if (!SOURCE_POLICIES[source].reviewed) {
    throw new BadRequestException(`Source "${source}" has not been reviewed yet`);
  }
}

/**
 * A reviewed source can still have no worker (a missing `requiredEnv`, or the workers are down).
 * Queueing then would leave the job `queued` forever, so the API answers 503 instead.
 */
export function assertWorkerPresent(source: SourceKey, present: boolean): void {
  if (!present) {
    throw new ServiceUnavailableException(`No worker is running for source "${source}"`);
  }
}

export function buildPlanTaskData(
  scrapingJobId: string,
  source: SourceKey,
  slugs?: string[],
): ScrapeTaskData {
  return slugs && slugs.length > 0
    ? { kind: 'plan', scrapingJobId, source, slugs }
    : { kind: 'plan', scrapingJobId, source };
}

/** Attempts come from the source policy; delays are computed by the worker's custom strategy. */
export function buildPlanJobOptions(
  source: SourceKey,
  scrapingJobId: string,
): { jobId: string; attempts: number; backoff: { type: 'custom' } } {
  return {
    jobId: `plan-${scrapingJobId}`,
    attempts: SOURCE_POLICIES[source].attempts,
    backoff: { type: 'custom' },
  };
}

/** Reads `slugs` back from the stored `params` JSON (used by retry). */
export function slugsFromParams(params: unknown): string[] | undefined {
  if (typeof params !== 'object' || params === null) return undefined;
  const slugs = (params as { slugs?: unknown }).slugs;
  if (!Array.isArray(slugs)) return undefined;
  const clean = slugs.filter((s): s is string => typeof s === 'string');
  return clean.length > 0 ? clean : undefined;
}
