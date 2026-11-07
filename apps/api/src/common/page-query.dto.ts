import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsString, Max, Min } from 'class-validator';

export const DEFAULT_LIMIT = 50;
export const MAX_LIMIT = 200;

export class PageQueryDto {
  @ApiPropertyOptional({ minimum: 1, maximum: MAX_LIMIT, default: DEFAULT_LIMIT })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(MAX_LIMIT)
  limit: number = DEFAULT_LIMIT;

  @ApiPropertyOptional({ description: 'Opaque cursor from a previous page' })
  @IsOptional()
  @IsString()
  cursor?: string;
}

/** Query strings give a single value for `a=x` and an array for `a[]=x&a[]=y`; always an array. */
export function toArray(value: unknown): unknown {
  if (value === undefined || value === null || value === '') return undefined;
  return Array.isArray(value) ? value : [value];
}
