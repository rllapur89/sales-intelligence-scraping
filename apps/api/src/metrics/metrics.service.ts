import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import {
  computeSuccessRate,
  roundAvgScore,
  startOfUtcDay,
  weekAgo,
  type MetricsSummary,
} from './metrics-math';

@Injectable()
export class MetricsService {
  constructor(private readonly prisma: PrismaService) {}

  async summary(now: Date = new Date()): Promise<MetricsSummary> {
    const [totalLeads, leadsToday, leadsThisWeek, activeJobs, completed, failed, avg] =
      await Promise.all([
        this.prisma.lead.count(),
        this.prisma.lead.count({ where: { createdAt: { gte: startOfUtcDay(now) } } }),
        this.prisma.lead.count({ where: { createdAt: { gte: weekAgo(now) } } }),
        this.prisma.scrapingJob.count({ where: { status: { in: ['QUEUED', 'RUNNING'] } } }),
        this.prisma.scrapingJob.count({ where: { status: 'COMPLETED' } }),
        this.prisma.scrapingJob.count({ where: { status: 'FAILED' } }),
        this.prisma.lead.aggregate({ _avg: { score: true } }),
      ]);
    return {
      totalLeads,
      leadsToday,
      activeJobs,
      successRate: computeSuccessRate(completed, failed),
      avgScore: roundAvgScore(avg._avg.score),
      jobsCompleted: completed,
      leadsThisWeek,
    };
  }
}
