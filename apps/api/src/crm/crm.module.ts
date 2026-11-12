import { Module } from '@nestjs/common';
import { ActivityService } from './activity.service';
import { AssigneeService } from './assignee.service';
import { LeadCrmController, TasksController } from './crm.controller';
import { NotesService } from './notes.service';
import { TasksService } from './tasks.service';

@Module({
  controllers: [LeadCrmController, TasksController],
  providers: [NotesService, ActivityService, TasksService, AssigneeService],
})
export class CrmModule {}
