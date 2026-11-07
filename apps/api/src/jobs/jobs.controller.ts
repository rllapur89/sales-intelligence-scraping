import { Body, Controller, Get, HttpCode, Param, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { Page, ScrapingJobDto } from '@leads/shared';
import { CreateJobDto, ListJobsQueryDto } from './jobs.dto';
import { JobsService } from './jobs.service';

@ApiBearerAuth()
@ApiTags('jobs')
@Controller('jobs')
export class JobsController {
  constructor(private readonly jobs: JobsService) {}

  @Get()
  @ApiOperation({ summary: 'List scraping jobs, newest first' })
  list(@Query() query: ListJobsQueryDto): Promise<Page<ScrapingJobDto>> {
    return this.jobs.list(query);
  }

  @Get(':id')
  get(@Param('id') id: string): Promise<ScrapingJobDto> {
    return this.jobs.get(id);
  }

  @Post()
  @ApiOperation({ summary: 'Create a scraping job and enqueue its plan task' })
  create(@Body() body: CreateJobDto): Promise<ScrapingJobDto> {
    return this.jobs.create(body);
  }

  @Post(':id/cancel')
  @HttpCode(200)
  cancel(@Param('id') id: string): Promise<ScrapingJobDto> {
    return this.jobs.cancel(id);
  }

  @Post(':id/retry')
  @ApiOperation({ summary: 'Create a new job from a failed or cancelled one' })
  retry(@Param('id') id: string): Promise<ScrapingJobDto> {
    return this.jobs.retry(id);
  }
}
