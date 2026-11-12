import type { BreakdownDto, FunnelDto, ScoreTrendDto, SignalMixDto } from '@leads/shared';

export type ReportState<T> =
  | { status: 'loading' }
  | { status: 'error'; message: string }
  | { status: 'ready'; data: T };

export const LOADING: ReportState<never> = { status: 'loading' };

/** Ranges offered by the selector; the API accepts 1-90. */
export const RANGE_OPTIONS = [7, 30, 90] as const;
export type RangeDays = (typeof RANGE_OPTIONS)[number];
export const DEFAULT_RANGE: RangeDays = 30;

/** A short, user-facing message for a failed request. Never echoes the server body. */
export function describeError(error: unknown): string {
  const status =
    typeof error === 'object' && error !== null && 'status' in error
      ? Number((error as { status: unknown }).status)
      : undefined;
  if (status === 0) return 'Cannot reach the server. Check your connection and try again.';
  if (status === 401 || status === 403) return 'You are not authorised to view this report.';
  if (status !== undefined && Number.isFinite(status))
    return `The server returned an error (${status}).`;
  return 'Something went wrong while loading this report.';
}

export const isFunnelEmpty = (dto: FunnelDto): boolean => dto.stages.every((s) => s.count === 0);
export const isBreakdownEmpty = (dto: BreakdownDto): boolean => dto.items.length === 0;
export const isSignalMixEmpty = (dto: SignalMixDto): boolean =>
  dto.items.every((i) => i.count === 0);
export const isTrendEmpty = (dto: ScoreTrendDto): boolean =>
  dto.points.every((p) => p.newLeads === 0);
