export interface MetricsSummary {
  totalLeads: number;
  leadsToday: number;
  activeJobs: number;
  /** 0-100; 100 when no job has finished yet. */
  successRate: number;
  avgScore: number;
  jobsCompleted: number;
  leadsThisWeek: number;
}

/** completed / (completed + failed) as a percentage rounded to 1 decimal; 100 when none. */
export function computeSuccessRate(completed: number, failed: number): number {
  const finished = completed + failed;
  if (finished === 0) return 100;
  return Math.round((completed / finished) * 1000) / 10;
}

/** Average score rounded to 1 decimal; 0 when there are no leads (null aggregate). */
export function roundAvgScore(avg: number | null): number {
  return avg === null ? 0 : Math.round(avg * 10) / 10;
}

/** "Today" is the current UTC calendar day. */
export function startOfUtcDay(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
}

/** "This week" is a rolling window of the last 7 days. */
export function weekAgo(now: Date): Date {
  return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
}
