import { Injectable } from '@nestjs/common';
import { Prisma, type $Enums } from '@leads/db';
import {
  SOURCE_KEYS,
  SOURCE_LABELS,
  buildBreakdown,
  buildFunnel,
  buildScoreTrend,
  buildSignalMix,
  scoreTrendStart,
  toDbSourceKey,
  type BreakdownDto,
  type FunnelDto,
  type ScoreTrendDto,
  type SignalMixDto,
  type SourceKey,
} from '@leads/shared';
import { PrismaService } from '../prisma/prisma.service';
import {
  industryRowsFromGroups,
  signalCountsFromGroups,
  stageCountsFromGroups,
  trendRowsFromRaw,
  type TrendRawRow,
} from './analytics-rows';

/** Thin orchestration: Prisma aggregates in, shared pure functions out. */
@Injectable()
export class AnalyticsService {
  constructor(private readonly prisma: PrismaService) {}

  async funnel(): Promise<FunnelDto> {
    const rows = await this.prisma.lead.groupBy({ by: ['stage'], _count: { _all: true } });
    return buildFunnel(stageCountsFromGroups(rows));
  }

  /** Leads that have at least one signal from the source, with their average score. */
  async bySource(): Promise<BreakdownDto> {
    const rows = await Promise.all(
      SOURCE_KEYS.map(async (key: SourceKey) => {
        const agg = await this.prisma.lead.aggregate({
          where: {
            company: {
              signals: { some: { source: { key: toDbSourceKey(key) as $Enums.SourceKey } } },
            },
          },
          _count: { _all: true },
          _avg: { score: true },
        });
        return { key: key as string | null, count: agg._count._all, avgScore: agg._avg.score };
      }),
    );
    return buildBreakdown(rows, (key) => SOURCE_LABELS[key as SourceKey] ?? key);
  }

  async byIndustry(): Promise<BreakdownDto> {
    const rows = await this.prisma.lead.groupBy({
      by: ['industry'],
      _count: { _all: true },
      _avg: { score: true },
    });
    return buildBreakdown(industryRowsFromGroups(rows));
  }

  async signals(): Promise<SignalMixDto> {
    const rows = await this.prisma.signal.groupBy({ by: ['type'], _count: { _all: true } });
    return buildSignalMix(signalCountsFromGroups(rows));
  }

  /** New leads and their average score per UTC day. The only raw SQL: it is date bucketing, and the
   * window start is a bound parameter (nothing from the request is interpolated into the SQL). */
  async scoreTrend(days: number, now: Date = new Date()): Promise<ScoreTrendDto> {
    const start = scoreTrendStart(days, now);
    const rows = await this.prisma.$queryRaw<TrendRawRow[]>(Prisma.sql`
      SELECT to_char(date_trunc('day', "createdAt"), 'YYYY-MM-DD') AS day,
             COUNT(*) AS count,
             AVG("score")::float8 AS avg
      FROM "Lead"
      WHERE "createdAt" >= ${start}
      GROUP BY 1
      ORDER BY 1
    `);
    return buildScoreTrend(days, trendRowsFromRaw(rows), now);
  }
}
