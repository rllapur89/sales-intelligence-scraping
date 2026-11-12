import { Body, Controller, Delete, Get, HttpCode, Param, Patch, Post, Query } from '@nestjs/common';
import { ApiBearerAuth, ApiOperation, ApiTags } from '@nestjs/swagger';
import type { ActivityDto, LeadDto, MyTaskDto, NoteDto, Page, TaskDto } from '@leads/shared';
import { CurrentUser } from '../auth/jwt-auth.guard';
import type { AuthUser } from '../auth/token.service';
import { ActivityService } from './activity.service';
import { AssigneeService } from './assignee.service';
import {
  ActivityQueryDto,
  AssignLeadDto,
  CreateNoteDto,
  CreateTaskDto,
  UpdateTaskDto,
} from './crm.dto';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';

@ApiBearerAuth()
@ApiTags('crm')
@Controller('leads/:id')
export class LeadCrmController {
  constructor(
    private readonly notes: NotesService,
    private readonly activity: ActivityService,
    private readonly tasks: TasksService,
    private readonly assignee: AssigneeService,
  ) {}

  @Get('notes')
  @ApiOperation({ summary: 'Notes of a lead, newest first' })
  listNotes(@Param('id') id: string): Promise<NoteDto[]> {
    return this.notes.list(id);
  }

  @Post('notes')
  @ApiOperation({ summary: 'Add a note (max 2000 characters)' })
  addNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateNoteDto,
  ): Promise<NoteDto> {
    return this.notes.create(id, user, body.body);
  }

  @Delete('notes/:noteId')
  @HttpCode(204)
  @ApiOperation({ summary: 'Delete a note (author or admin only)' })
  removeNote(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ): Promise<void> {
    return this.notes.remove(id, noteId, user);
  }

  @Get('activity')
  @ApiOperation({ summary: 'CRM timeline of a lead, newest first, keyset pagination' })
  listActivity(
    @Param('id') id: string,
    @Query() query: ActivityQueryDto,
  ): Promise<Page<ActivityDto>> {
    return this.activity.list(id, query);
  }

  @Get('tasks')
  @ApiOperation({ summary: 'Tasks of a lead, open first' })
  listTasks(@Param('id') id: string): Promise<TaskDto[]> {
    return this.tasks.listForLead(id);
  }

  @Post('tasks')
  @ApiOperation({ summary: 'Create a task (assignee defaults to the caller)' })
  addTask(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: CreateTaskDto,
  ): Promise<TaskDto> {
    return this.tasks.create(id, user, body);
  }

  @Patch('assignee')
  @ApiOperation({ summary: 'Assign the lead to a user, or unassign with null' })
  assign(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: AssignLeadDto,
  ): Promise<LeadDto> {
    return this.assignee.assign(id, user, body.assigneeId);
  }
}

@ApiBearerAuth()
@ApiTags('crm')
@Controller('tasks')
export class TasksController {
  constructor(private readonly tasks: TasksService) {}

  /** Declared before `:id` routes so `mine` is never read as a task id. */
  @Get('mine')
  @ApiOperation({ summary: 'Open tasks assigned to me, due first (no due date last)' })
  mine(@CurrentUser() user: AuthUser): Promise<MyTaskDto[]> {
    return this.tasks.mine(user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Edit title/due date, complete (done: true) or reopen a task' })
  update(
    @CurrentUser() user: AuthUser,
    @Param('id') id: string,
    @Body() body: UpdateTaskDto,
  ): Promise<TaskDto> {
    return this.tasks.update(id, user, body);
  }
}
