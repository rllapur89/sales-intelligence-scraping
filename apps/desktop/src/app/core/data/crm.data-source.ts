import { Injectable, inject } from '@angular/core';
import { HttpClient, HttpParams } from '@angular/common/http';
import { Observable, of, throwError } from 'rxjs';
import {
  compareMyTasks,
  type ActivityDto,
  type ActivityType,
  type MyTaskDto,
  type NoteDto,
  type Page,
  type TaskDto,
  type UserRole,
} from '@leads/shared';
import { AuthService } from '../auth/auth.service';
import { ENVIRONMENT } from '../config/app-environment';
import { noteBodyError, taskTitleError } from '../crm/crm-view';
import { Lead } from '../models/lead.model';
import { MockDataService } from '../services/mock-data.service';

/** Activity entries fetched per request (keyset pages, newest first). */
export const ACTIVITY_PAGE_SIZE = 20;

export interface CrmUser {
  id: string;
  displayName: string;
  role: UserRole;
}

export interface NewTaskInput {
  title: string;
  /** ISO instant; omitted or null = no due date. */
  dueAt?: string | null;
  /** Omitted = the current user; null = unassigned. */
  assigneeId?: string | null;
}

export interface TaskPatch {
  title?: string;
  dueAt?: string | null;
  done?: boolean;
}

/** Where the CRM UI gets notes, tasks and activity from (in-memory mock or the REST API). */
export abstract class CrmDataSource {
  /** The signed-in user: author of notes, default task assignee, "me" for assignment. */
  abstract currentUser(): CrmUser;
  abstract listNotes(leadId: string): Observable<NoteDto[]>;
  abstract addNote(leadId: string, body: string): Observable<NoteDto>;
  abstract deleteNote(leadId: string, noteId: string): Observable<void>;
  abstract listActivity(leadId: string, cursor: string | null): Observable<Page<ActivityDto>>;
  abstract listTasks(leadId: string): Observable<TaskDto[]>;
  abstract addTask(leadId: string, input: NewTaskInput): Observable<TaskDto>;
  abstract updateTask(taskId: string, patch: TaskPatch): Observable<TaskDto>;
  /** Open tasks assigned to the current user, due first (no due date last). */
  abstract myTasks(): Observable<MyTaskDto[]>;
  /** Sets or clears the owner and emits the lead as the server (or mock) now holds it. */
  abstract assign(lead: Lead, assigneeId: string | null): Observable<Lead>;
}

export const MOCK_USER: CrmUser = { id: 'mock-user', displayName: 'Demo user', role: 'user' };

/** Mock mode: everything lives in memory for the session, no backend needed. */
@Injectable()
export class MockCrmDataSource extends CrmDataSource {
  private readonly leads = inject(MockDataService);
  private notes: NoteDto[] = [];
  private tasks: TaskDto[] = [];
  /** Newest first. */
  private activity: ActivityDto[] = [];
  private nextId = 1;

  currentUser(): CrmUser {
    return MOCK_USER;
  }

  listNotes(leadId: string): Observable<NoteDto[]> {
    return of(this.notes.filter((n) => n.leadId === leadId));
  }

  addNote(leadId: string, body: string): Observable<NoteDto> {
    const error = noteBodyError(body);
    if (error) return throwError(() => new Error(error));
    const note: NoteDto = {
      id: this.id('note'),
      leadId,
      authorId: MOCK_USER.id,
      body: body.trim(),
      createdAt: new Date().toISOString(),
    };
    this.notes = [note, ...this.notes];
    this.log(leadId, 'note_added', { noteId: note.id });
    return of(note);
  }

  deleteNote(leadId: string, noteId: string): Observable<void> {
    const note = this.notes.find((n) => n.id === noteId && n.leadId === leadId);
    if (!note) return throwError(() => new Error('Note not found'));
    this.notes = this.notes.filter((n) => n.id !== noteId);
    return of(undefined);
  }

  listActivity(leadId: string, cursor: string | null): Observable<Page<ActivityDto>> {
    const all = this.activity.filter((a) => a.leadId === leadId);
    const start = cursor === null ? 0 : Number(cursor);
    if (!Number.isInteger(start) || start < 0) return throwError(() => new Error('Invalid cursor'));
    const items = all.slice(start, start + ACTIVITY_PAGE_SIZE);
    const end = start + items.length;
    return of({ items, nextCursor: end < all.length ? String(end) : null });
  }

  listTasks(leadId: string): Observable<TaskDto[]> {
    const open = this.tasks.filter((t) => t.leadId === leadId && t.doneAt === null);
    const done = this.tasks.filter((t) => t.leadId === leadId && t.doneAt !== null);
    return of([...open.sort(compareMyTasks), ...done]);
  }

  addTask(leadId: string, input: NewTaskInput): Observable<TaskDto> {
    const error = taskTitleError(input.title);
    if (error) return throwError(() => new Error(error));
    const task: TaskDto = {
      id: this.id('task'),
      leadId,
      createdById: MOCK_USER.id,
      assigneeId: input.assigneeId === undefined ? MOCK_USER.id : input.assigneeId,
      title: input.title.trim(),
      dueAt: input.dueAt ?? null,
      doneAt: null,
      createdAt: new Date().toISOString(),
    };
    this.tasks = [...this.tasks, task];
    this.log(leadId, 'task_created', { taskId: task.id, assigneeId: task.assigneeId });
    return of(task);
  }

  updateTask(taskId: string, patch: TaskPatch): Observable<TaskDto> {
    const current = this.tasks.find((t) => t.id === taskId);
    if (!current) return throwError(() => new Error('Task not found'));
    if (patch.title !== undefined) {
      const error = taskTitleError(patch.title);
      if (error) return throwError(() => new Error(error));
    }
    let doneAt = current.doneAt;
    if (patch.done === true && doneAt === null) {
      doneAt = new Date().toISOString();
      this.log(current.leadId, 'task_completed', { taskId });
    } else if (patch.done === false) {
      doneAt = null;
    }
    const updated: TaskDto = {
      ...current,
      title: patch.title === undefined ? current.title : patch.title.trim(),
      dueAt: patch.dueAt === undefined ? current.dueAt : patch.dueAt,
      doneAt,
    };
    this.tasks = this.tasks.map((t) => (t.id === taskId ? updated : t));
    return of(updated);
  }

  myTasks(): Observable<MyTaskDto[]> {
    const names = new Map(this.leads.getLeads().map((l) => [l.id, l.company.name]));
    const mine = this.tasks
      .filter((t) => t.assigneeId === MOCK_USER.id && t.doneAt === null)
      .sort(compareMyTasks)
      .map((t) => ({ ...t, companyName: names.get(t.leadId) ?? 'Unknown company' }));
    return of(mine);
  }

  assign(lead: Lead, assigneeId: string | null): Observable<Lead> {
    const previous = lead.assigneeId ?? null;
    if (previous !== assigneeId) this.log(lead.id, 'assigned', { from: previous, to: assigneeId });
    return of({ ...lead, assigneeId });
  }

  private id(prefix: string): string {
    return `${prefix}-${this.nextId++}`;
  }

  private log(leadId: string, type: ActivityType, data: Record<string, unknown>): void {
    this.activity = [
      {
        id: this.id('act'),
        leadId,
        actorId: MOCK_USER.id,
        type,
        data,
        createdAt: new Date().toISOString(),
      },
      ...this.activity,
    ];
  }
}

/** Live mode: the CRM REST endpoints. Auth headers come from `authInterceptor`. */
@Injectable()
export class LiveCrmDataSource extends CrmDataSource {
  private readonly http = inject(HttpClient);
  private readonly auth = inject(AuthService);
  private readonly api = inject(ENVIRONMENT).apiUrl;

  currentUser(): CrmUser {
    const user = this.auth.user();
    return user
      ? { id: user.id, displayName: user.displayName, role: user.role }
      : { id: '', displayName: '', role: 'user' };
  }

  listNotes(leadId: string): Observable<NoteDto[]> {
    return this.http.get<NoteDto[]>(`${this.lead(leadId)}/notes`);
  }

  addNote(leadId: string, body: string): Observable<NoteDto> {
    return this.http.post<NoteDto>(`${this.lead(leadId)}/notes`, { body: body.trim() });
  }

  deleteNote(leadId: string, noteId: string): Observable<void> {
    return this.http.delete<void>(`${this.lead(leadId)}/notes/${encodeURIComponent(noteId)}`);
  }

  listActivity(leadId: string, cursor: string | null): Observable<Page<ActivityDto>> {
    let params = new HttpParams().set('limit', ACTIVITY_PAGE_SIZE);
    if (cursor) params = params.set('cursor', cursor);
    return this.http.get<Page<ActivityDto>>(`${this.lead(leadId)}/activity`, { params });
  }

  listTasks(leadId: string): Observable<TaskDto[]> {
    return this.http.get<TaskDto[]>(`${this.lead(leadId)}/tasks`);
  }

  addTask(leadId: string, input: NewTaskInput): Observable<TaskDto> {
    return this.http.post<TaskDto>(`${this.lead(leadId)}/tasks`, {
      title: input.title.trim(),
      ...(input.dueAt !== undefined && { dueAt: input.dueAt }),
      ...(input.assigneeId !== undefined && { assigneeId: input.assigneeId }),
    });
  }

  updateTask(taskId: string, patch: TaskPatch): Observable<TaskDto> {
    return this.http.patch<TaskDto>(`${this.api}/tasks/${encodeURIComponent(taskId)}`, patch);
  }

  myTasks(): Observable<MyTaskDto[]> {
    return this.http.get<MyTaskDto[]>(`${this.api}/tasks/mine`);
  }

  assign(lead: Lead, assigneeId: string | null): Observable<Lead> {
    return this.http.patch<Lead>(`${this.lead(lead.id)}/assignee`, { assigneeId });
  }

  private lead(id: string): string {
    return `${this.api}/leads/${encodeURIComponent(id)}`;
  }
}
