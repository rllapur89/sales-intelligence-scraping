import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsISO8601,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
  ValidateIf,
} from 'class-validator';
import { NOTE_MAX_LENGTH, TASK_TITLE_MAX_LENGTH } from '@leads/shared';
import { PageQueryDto } from '../common/page-query.dto';

export class CreateNoteDto {
  @ApiProperty({ maxLength: NOTE_MAX_LENGTH })
  @IsString()
  @MaxLength(NOTE_MAX_LENGTH)
  body!: string;
}

export class ActivityQueryDto extends PageQueryDto {}

export class CreateTaskDto {
  @ApiProperty({ maxLength: TASK_TITLE_MAX_LENGTH })
  @IsString()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title!: string;

  @ApiPropertyOptional({ nullable: true, description: 'ISO-8601 due date' })
  @IsOptional()
  @IsISO8601()
  dueAt?: string | null;

  @ApiPropertyOptional({
    nullable: true,
    description: 'User id. Omitted = the creator; null = unassigned',
  })
  @ValidateIf((o: CreateTaskDto) => o.assigneeId !== undefined && o.assigneeId !== null)
  @IsString()
  @IsNotEmpty()
  assigneeId?: string | null;
}

export class UpdateTaskDto {
  @ApiPropertyOptional({ maxLength: TASK_TITLE_MAX_LENGTH })
  @IsOptional()
  @IsString()
  @MaxLength(TASK_TITLE_MAX_LENGTH)
  title?: string;

  @ApiPropertyOptional({ nullable: true, description: 'ISO-8601 due date; null clears it' })
  @ValidateIf((o: UpdateTaskDto) => o.dueAt !== undefined && o.dueAt !== null)
  @IsISO8601()
  dueAt?: string | null;

  @ApiPropertyOptional({ description: 'true completes the task, false reopens it' })
  @IsOptional()
  @IsBoolean()
  done?: boolean;
}

export class AssignLeadDto {
  @ApiProperty({ nullable: true, type: String, description: 'User id, or null to unassign' })
  @ValidateIf((o: AssignLeadDto) => o.assigneeId !== null)
  @IsString()
  @IsNotEmpty()
  assigneeId!: string | null;
}
