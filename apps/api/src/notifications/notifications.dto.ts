import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import { ArrayMaxSize, IsArray, IsBoolean, IsOptional, IsString, MinLength } from 'class-validator';
import { NOTIFICATIONS_READ_MAX_IDS } from '@leads/shared';
import { PageQueryDto } from '../common/page-query.dto';

/** Query strings are text: only the literal `true` / `false` are accepted. */
function toBoolean({ value }: { value: unknown }): unknown {
  if (value === 'true') return true;
  if (value === 'false') return false;
  return value;
}

export class NotificationsQueryDto extends PageQueryDto {
  @ApiPropertyOptional({ default: false, description: 'Only notifications not read yet' })
  @IsOptional()
  @Transform(toBoolean)
  @IsBoolean()
  unreadOnly?: boolean;
}

export class MarkReadDto {
  @ApiPropertyOptional({ type: [String], maxItems: NOTIFICATIONS_READ_MAX_IDS })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(NOTIFICATIONS_READ_MAX_IDS)
  @IsString({ each: true })
  @MinLength(1, { each: true })
  ids?: string[];

  @ApiPropertyOptional({ description: 'Mark every unread notification of the caller as read' })
  @IsOptional()
  @IsBoolean()
  all?: boolean;
}

export class MarkReadResponseDto {
  @ApiProperty()
  updated!: number;
}
