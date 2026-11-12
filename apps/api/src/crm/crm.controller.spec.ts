import 'reflect-metadata';
import { describe, expect, it, vi } from 'vitest';
import type { ActivityService } from './activity.service';
import type { AssigneeService } from './assignee.service';
import { LeadCrmController, TasksController } from './crm.controller';
import type { NotesService } from './notes.service';
import type { TasksService } from './tasks.service';

const user = { id: 'u1', email: 'a@x.io', role: 'user' as const };

function setup() {
  const notes = { list: vi.fn(), create: vi.fn(), remove: vi.fn() };
  const activity = { list: vi.fn() };
  const tasks = { listForLead: vi.fn(), create: vi.fn(), update: vi.fn(), mine: vi.fn() };
  const assignee = { assign: vi.fn() };
  const lead = new LeadCrmController(
    notes as unknown as NotesService,
    activity as unknown as ActivityService,
    tasks as unknown as TasksService,
    assignee as unknown as AssigneeService,
  );
  const tasksCtl = new TasksController(tasks as unknown as TasksService);
  return { notes, activity, tasks, assignee, lead, tasksCtl };
}

describe('LeadCrmController', () => {
  it('delegates notes with the authenticated user', async () => {
    const s = setup();
    s.notes.create.mockResolvedValue({ id: 'n1' });
    await s.lead.listNotes('l1');
    expect(await s.lead.addNote(user, 'l1', { body: 'hi' })).toEqual({ id: 'n1' });
    await s.lead.removeNote(user, 'l1', 'n1');
    expect(s.notes.list).toHaveBeenCalledWith('l1');
    expect(s.notes.create).toHaveBeenCalledWith('l1', user, 'hi');
    expect(s.notes.remove).toHaveBeenCalledWith('l1', 'n1', user);
  });

  it('delegates activity, tasks and assignee', async () => {
    const s = setup();
    const query = { limit: 10, cursor: 'c' };
    await s.lead.listActivity('l1', query);
    await s.lead.listTasks('l1');
    await s.lead.addTask(user, 'l1', { title: 'Call' });
    await s.lead.assign(user, 'l1', { assigneeId: null });
    expect(s.activity.list).toHaveBeenCalledWith('l1', query);
    expect(s.tasks.listForLead).toHaveBeenCalledWith('l1');
    expect(s.tasks.create).toHaveBeenCalledWith('l1', user, { title: 'Call' });
    expect(s.assignee.assign).toHaveBeenCalledWith('l1', user, null);
  });

  it('answers note deletion with 204', () => {
    const code = Reflect.getMetadata('__httpCode__', LeadCrmController.prototype.removeNote);
    expect(code).toBe(204);
  });
});

describe('TasksController', () => {
  it('lists my tasks by the caller id and updates by task id', async () => {
    const s = setup();
    await s.tasksCtl.mine(user);
    await s.tasksCtl.update(user, 't1', { done: true });
    expect(s.tasks.mine).toHaveBeenCalledWith('u1');
    expect(s.tasks.update).toHaveBeenCalledWith('t1', user, { done: true });
  });

  it('declares `mine` before the `:id` route', () => {
    const names = Object.getOwnPropertyNames(TasksController.prototype).filter(
      (n) => n !== 'constructor',
    );
    expect(names.indexOf('mine')).toBeLessThan(names.indexOf('update'));
  });
});
