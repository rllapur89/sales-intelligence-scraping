import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, Max, Min } from 'class-validator';
import { ANALYTICS_DEFAULT_DAYS, ANALYTICS_MAX_DAYS } from '@leads/shared';

export class ScoreTrendQueryDto {
  @ApiPropertyOptional({
    minimum: 1,
    maximum: ANALYTICS_MAX_DAYS,
    default: ANALYTICS_DEFAULT_DAYS,
    description: 'Length of the window in UTC days, ending today',
  })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(ANALYTICS_MAX_DAYS)
  days: number = ANALYTICS_DEFAULT_DAYS;
}
