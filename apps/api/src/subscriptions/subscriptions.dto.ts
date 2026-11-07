import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  MinLength,
} from 'class-validator';
import { SIGNAL_TYPES, type SignalType } from '@leads/shared';

export class CreateSubscriptionDto {
  @ApiProperty()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: [String], description: 'Empty = any' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  industries?: string[];

  @ApiPropertyOptional({ type: [String], description: 'Empty = any' })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  regions?: string[];

  @ApiPropertyOptional({ enum: SIGNAL_TYPES, isArray: true, description: 'Empty = any' })
  @IsOptional()
  @IsArray()
  @IsIn(SIGNAL_TYPES, { each: true })
  signalTypes?: SignalType[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100, default: 0 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;
}

export class UpdateSubscriptionDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(100)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  active?: boolean;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  industries?: string[];

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(100)
  @IsString({ each: true })
  @MaxLength(100, { each: true })
  regions?: string[];

  @ApiPropertyOptional({ enum: SIGNAL_TYPES, isArray: true })
  @IsOptional()
  @IsArray()
  @IsIn(SIGNAL_TYPES, { each: true })
  signalTypes?: SignalType[];

  @ApiPropertyOptional({ minimum: 0, maximum: 100 })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(100)
  minScore?: number;
}
