import { Body, Controller, Get, Param, Patch, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { LeadDto, Page } from '@leads/shared';
import { ListLeadsQueryDto, UpdateStageDto } from './leads.dto';
import { LeadsService, type LeadDetailDto } from './leads.service';

@ApiBearerAuth()
@ApiTags('leads')
@Controller('leads')
export class LeadsController {
  constructor(private readonly leads: LeadsService) {}

  @Get()
  @ApiOperation({ summary: 'List leads with keyset pagination and filters' })
  list(@Query() query: ListLeadsQueryDto): Promise<Page<LeadDto>> {
    return this.leads.list(query);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Lead detail with its latest 50 signals' })
  get(@Param('id') id: string): Promise<LeadDetailDto> {
    return this.leads.get(id);
  }

  @Patch(':id/stage')
  @ApiOperation({ summary: 'Change the pipeline stage of a lead' })
  updateStage(@Param('id') id: string, @Body() body: UpdateStageDto): Promise<LeadDto> {
    return this.leads.updateStage(id, body.stage);
  }
}
