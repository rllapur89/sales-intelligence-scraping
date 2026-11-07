import type { SourceKey } from '@leads/shared';

/** Same shape as `GET /api/metrics/summary`. */
export interface DashboardMetrics {
  totalLeads: number;
  leadsToday: number;
  activeJobs: number;
  successRate: number;
  avgScore: number;
  jobsCompleted: number;
  leadsThisWeek: number;
}

export interface ChartPoint {
  label: string;
  value: number;
}

export interface ActivityEvent {
  id: string;
  type: 'lead_found' | 'job_started' | 'job_completed' | 'job_failed' | 'export';
  message: string;
  timestamp: Date;
  meta?: { count?: number; jobName?: string; company?: string; source?: SourceKey };
}

export interface SystemHealth {
  memoryUsedMb: number;
  memoryTotalMb: number;
  cpuPercent: number;
  connectivity: 'online' | 'offline' | 'degraded';
  queueSize: number;
}
