import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsIn,
  IsOptional,
  IsString,
  Matches,
  MaxLength,
} from 'class-validator';
import { SOURCE_KEYS, type SourceKey } from '@leads/shared';
import { PageQueryDto } from '../common/page-query.dto';

export class ListJobsQueryDto extends PageQueryDto {}

export class CreateJobDto {
  @ApiProperty({ enum: SOURCE_KEYS })
  @IsIn(SOURCE_KEYS)
  source!: SourceKey;

  @ApiPropertyOptional({ type: [String], description: 'Company slugs; omit for all targets' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(500)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  @Matches(/^[a-z0-9][a-z0-9._-]*$/i, { each: true })
  slugs?: string[];
}
