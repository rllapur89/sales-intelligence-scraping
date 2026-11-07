import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import { IsArray, IsIn, IsInt, IsOptional, IsString, Max, MaxLength, Min } from 'class-validator';
import { PIPELINE_STAGES, SIGNAL_TYPES, type PipelineStage, type SignalType } from '@leads/shared';
import { PageQueryDto, toArray } from '../common/page-query.dto';

export class ListLeadsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ enum: ['score', 'updated'], default: 'score' })
  @IsOptional()
  @IsIn(['score', 'updated'])
  sort: 'score' | 'updated' = 'score';

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsString({ each: true })
  industry?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsString({ each: true })
  region?: string[];

  @ApiPropertyOptional({ enum: SIGNAL_TYPES, isArray: true })
  @IsOptional()
  @Transform(({ value }) => toArray(value))
  @IsArray()
  @IsIn(SIGNAL_TYPES, { each: true })
  signalType?: SignalType[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;

  @ApiPropertyOptional({ enum: PIPELINE_STAGES })
  @IsOptional()
  @IsIn(PIPELINE_STAGES)
  stage?: PipelineStage;

  @ApiPropertyOptional({ description: 'Company name contains (case-insensitive)' })
  @IsOptional()
  @IsString()
  @MaxLength(200)
  q?: string;
}

export class UpdateStageDto {
  @ApiProperty({ enum: PIPELINE_STAGES })
  @IsIn(PIPELINE_STAGES)
  stage!: PipelineStage;
}
