import { Controller, Get, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { BreakdownDto, FunnelDto, ScoreTrendDto, SignalMixDto } from '@leads/shared';
import { ScoreTrendQueryDto } from './analytics.dto';
import { AnalyticsService } from './analytics.service';

/** Authenticated by the global JWT guard like every non-@Public route. */
@ApiBearerAuth()
@ApiTags('analytics')
@Controller('analytics')
export class AnalyticsController {
  constructor(private readonly analytics: AnalyticsService) {}

  @Get('funnel')
  @ApiOperation({ summary: 'Cumulative pipeline funnel with stage-to-stage conversion' })
  funnel(): Promise<FunnelDto> {
    return this.analytics.funnel();
  }

  @Get('by-source')
  @ApiOperation({ summary: 'Leads and average score per data source' })
  bySource(): Promise<BreakdownDto> {
    return this.analytics.bySource();
  }

  @Get('by-industry')
  @ApiOperation({ summary: 'Leads and average score per industry' })
  byIndustry(): Promise<BreakdownDto> {
    return this.analytics.byIndustry();
  }

  @Get('signals')
  @ApiOperation({ summary: 'Signal count per signal type' })
  signals(): Promise<SignalMixDto> {
    return this.analytics.signals();
  }

  @Get('score-trend')
  @ApiOperation({ summary: 'New leads and average score per UTC day, zero-filled' })
  scoreTrend(@Query() query: ScoreTrendQueryDto): Promise<ScoreTrendDto> {
    return this.analytics.scoreTrend(query.days);
  }
}
