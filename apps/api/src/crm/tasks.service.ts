import { Injectable, NotFoundException } from '@nestjs/common';
import { toMyTaskDto, toTaskDto, type MyTaskDto, type TaskDto } from '@leads/shared';
import type { AuthUser } from '../auth/token.service';
import { PrismaService } from '../prisma/prisma.service';
import {
  LEAD_TASKS_ORDER_BY,
  MY_TASKS_ORDER_BY,
  buildTaskPatch,
  taskCompletedActivity,
  taskCreatedActivity,
  toActivityCreate,
  validateTaskTitle,
} from './crm-rules';
import type { CreateTaskDto, UpdateTaskDto } from './crm.dto';
import { requireLead, requireUser } from './lead-lookup';

export const TASKS_LIST_LIMIT = 200;

@Injectable()
export class TasksService {
  constructor(private readonly prisma: PrismaService) {}

  async listForLead(leadId: string): Promise<TaskDto[]> {
    await requireLead(this.prisma, leadId);
    const rows = await this.prisma.leadTask.findMany({
      where: { leadId },
      orderBy: LEAD_TASKS_ORDER_BY,
      take: TASKS_LIST_LIMIT,
    });
    return rows.map(toTaskDto);
  }

  /** The assignee defaults to the creator; an explicit null leaves the task unassigned. */
  async create(leadId: string, actor: AuthUser, body: CreateTaskDto): Promise<TaskDto> {
    const title = validateTaskTitle(body.title);
    const assigneeId = body.assigneeId === undefined ? actor.id : body.assigneeId;
    await requireLead(this.prisma, leadId);
    if (assigneeId !== null && assigneeId !== actor.id) await requireUser(this.prisma, assigneeId);
    const task = await this.prisma.$transaction(async (tx) => {
      const created = await tx.leadTask.create({
        data: {
          leadId,
          createdById: actor.id,
          assigneeId,
          title,
          dueAt: body.dueAt ? new Date(body.dueAt) : null,
        },
      });
      await tx.leadActivity.create({
        data: toActivityCreate(leadId, actor.id, taskCreatedActivity(created.id, assigneeId)),
      });
      return created;
    });
    return toTaskDto(task);
  }

  /** Edits title/due date and completes or reopens. Completing records `task_completed` once. */
  async update(taskId: string, actor: AuthUser, body: UpdateTaskDto): Promise<TaskDto> {
    const existing = await this.prisma.leadTask.findUnique({ where: { id: taskId } });
    if (!existing) throw new NotFoundException(`Task ${taskId} not found`);
    const { data, completed } = buildTaskPatch(existing, body, new Date());
    if (Object.keys(data).length === 0) return toTaskDto(existing);
    const task = await this.prisma.$transaction(async (tx) => {
      const updated = await tx.leadTask.update({ where: { id: taskId }, data });
      if (completed) {
        await tx.leadActivity.create({
          data: toActivityCreate(existing.leadId, actor.id, taskCompletedActivity(taskId)),
        });
      }
      return updated;
    });
    return toTaskDto(task);
  }

  /** Open tasks assigned to the user: earliest due first, no due date last. */
  async mine(userId: string): Promise<MyTaskDto[]> {
    const rows = await this.prisma.leadTask.findMany({
      where: { assigneeId: userId, doneAt: null },
      orderBy: MY_TASKS_ORDER_BY,
      take: TASKS_LIST_LIMIT,
      include: { lead: { select: { company: { select: { name: true } } } } },
    });
    return rows.map(toMyTaskDto);
  }
}
