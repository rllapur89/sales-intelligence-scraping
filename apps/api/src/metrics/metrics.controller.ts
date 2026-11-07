import { Controller, Get } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { MetricsSummary } from './metrics-math';
import { MetricsService } from './metrics.service';

@ApiBearerAuth()
@ApiTags('metrics')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metrics: MetricsService) {}

  @Get('summary')
  @ApiOperation({ summary: 'Dashboard counters' })
  summary(): Promise<MetricsSummary> {
    return this.metrics.summary();
  }
}
