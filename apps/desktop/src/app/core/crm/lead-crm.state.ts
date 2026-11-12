import { Injectable, inject, signal } from '@angular/core';
import type { Observable } from 'rxjs';
import type { ActivityDto, NoteDto, TaskDto } from '@leads/shared';
import { CrmDataSource } from '../data/crm.data-source';
import { Lead } from '../models/lead.model';
import { errorMessage } from '../util/errors';
import { noteBodyError, taskTitleError } from './crm-view';

export type SectionStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface Section<T> {
  status: SectionStatus;
  items: T;
  error: string | null;
}

const idle = <T>(items: T): Section<T> => ({ status: 'idle', items, error: null });

/** Open tasks first, then done ones; keeps the server order inside each group. */
export function openFirst(tasks: readonly TaskDto[]): TaskDto[] {
  return [...tasks.filter((t) => t.doneAt === null), ...tasks.filter((t) => t.doneAt !== null)];
}

/**
 * State of the CRM tabs of one lead (notes, tasks, activity). Provided per panel; `open(leadId)`
 * resets it when another lead is selected, and answers that arrive for a previous lead are dropped.
 */
@Injectable()
export class LeadCrmState {
  private readonly source = inject(CrmDataSource);
  private leadId: string | null = null;
  private activityCursor: string | null = null;

  readonly me = this.source.currentUser();
  readonly notes = signal<Section<NoteDto[]>>(idle([]));
  readonly tasks = signal<Section<TaskDto[]>>(idle([]));
  readonly activity = signal<Section<ActivityDto[]>>(idle([]));
  readonly hasMoreActivity = signal(false);
  readonly loadingMoreActivity = signal(false);
  /** A save is in flight (disables the forms). */
  readonly saving = signal(false);
  /** Validation or server error of the last form submit or row action; null when none. */
  readonly actionError = signal<string | null>(null);

  open(leadId: string): void {
    this.leadId = leadId;
    this.activityCursor = null;
    this.hasMoreActivity.set(false);
    this.loadingMoreActivity.set(false);
    this.saving.set(false);
    this.actionError.set(null);
    this.loadNotes();
    this.loadTasks();
    this.loadActivity();
  }

  loadNotes(): void {
    this.load(this.notes, (id) => this.source.listNotes(id), 'Could not load the notes.');
  }

  loadTasks(): void {
    this.load(
      this.tasks,
      (id) => this.source.listTasks(id),
      'Could not load the tasks.',
      openFirst,
    );
  }

  loadActivity(): void {
    const leadId = this.leadId;
    if (!leadId) return;
    this.activity.update((s) => ({ ...s, status: 'loading', error: null }));
    this.source.listActivity(leadId, null).subscribe({
      next: (page) => {
        if (this.leadId !== leadId) return;
        this.activityCursor = page.nextCursor;
        this.hasMoreActivity.set(page.nextCursor !== null);
        this.activity.set({ status: 'ready', items: page.items, error: null });
      },
      error: (err) => {
        if (this.leadId !== leadId) return;
        this.activity.set({
          status: 'error',
          items: [],
          error: errorMessage(err, 'Could not load the activity.'),
        });
      },
    });
  }

  loadMoreActivity(): void {
    const leadId = this.leadId;
    const cursor = this.activityCursor;
    if (!leadId || cursor === null || this.loadingMoreActivity()) return;
    this.loadingMoreActivity.set(true);
    this.source.listActivity(leadId, cursor).subscribe({
      next: (page) => {
        if (this.leadId !== leadId) return;
        this.activityCursor = page.nextCursor;
        this.hasMoreActivity.set(page.nextCursor !== null);
        this.activity.update((s) => ({ ...s, items: [...s.items, ...page.items] }));
        this.loadingMoreActivity.set(false);
      },
      error: (err) => {
        if (this.leadId !== leadId) return;
        this.loadingMoreActivity.set(false);
        this.actionError.set(errorMessage(err, 'Could not load more activity.'));
      },
    });
  }

  canDeleteNote(note: NoteDto): boolean {
    return this.me.role === 'admin' || note.authorId === this.me.id;
  }

  addNote(body: string, onSaved?: () => void): void {
    const leadId = this.leadId;
    const invalid = noteBodyError(body);
    if (!leadId || this.saving()) return;
    if (invalid) {
      this.actionError.set(invalid);
      return;
    }
    this.begin();
    this.source.addNote(leadId, body).subscribe({
      next: (note) => {
        if (this.leadId !== leadId) return;
        this.saving.set(false);
        this.notes.update((s) => ({ ...s, status: 'ready', items: [note, ...s.items] }));
        this.refreshActivity();
        onSaved?.();
      },
      error: (err) => this.fail(leadId, err, 'Could not save the note.'),
    });
  }

  deleteNote(note: NoteDto): void {
    const leadId = this.leadId;
    if (!leadId || !this.canDeleteNote(note)) return;
    this.actionError.set(null);
    this.source.deleteNote(leadId, note.id).subscribe({
      next: () => {
        if (this.leadId !== leadId) return;
        this.notes.update((s) => ({ ...s, items: s.items.filter((n) => n.id !== note.id) }));
      },
      error: (err) => this.fail(leadId, err, 'Could not delete the note.'),
    });
  }

  /** `dueAt` is an ISO instant or null; the task is assigned to me unless `assignToMe` is false. */
  addTask(title: string, dueAt: string | null, assignToMe: boolean, onSaved?: () => void): void {
    const leadId = this.leadId;
    const invalid = taskTitleError(title);
    if (!leadId || this.saving()) return;
    if (invalid) {
      this.actionError.set(invalid);
      return;
    }
    this.begin();
    this.source
      .addTask(leadId, { title, dueAt, assigneeId: assignToMe ? this.me.id : null })
      .subscribe({
        next: (task) => {
          if (this.leadId !== leadId) return;
          this.saving.set(false);
          this.tasks.update((s) => ({
            ...s,
            status: 'ready',
            items: openFirst([...s.items, task]),
          }));
          this.refreshActivity();
          onSaved?.();
        },
        error: (err) => this.fail(leadId, err, 'Could not create the task.'),
      });
  }

  toggleTask(task: TaskDto): void {
    const leadId = this.leadId;
    if (!leadId) return;
    this.actionError.set(null);
    this.source.updateTask(task.id, { done: task.doneAt === null }).subscribe({
      next: (saved) => {
        if (this.leadId !== leadId) return;
        this.tasks.update((s) => ({
          ...s,
          items: openFirst(s.items.map((t) => (t.id === saved.id ? saved : t))),
        }));
        this.refreshActivity();
      },
      error: (err) => this.fail(leadId, err, 'Could not update the task.'),
    });
  }

  /** Assigns the lead to me or unassigns it; `onSaved` receives the lead to put in the store. */
  assign(lead: Lead, toMe: boolean, onSaved: (lead: Lead) => void): void {
    const leadId = this.leadId;
    if (!leadId) return;
    this.actionError.set(null);
    this.source.assign(lead, toMe ? this.me.id : null).subscribe({
      next: (saved) => {
        if (this.leadId !== leadId) return;
        onSaved(saved);
        this.refreshActivity();
      },
      error: (err) => this.fail(leadId, err, 'Could not change the owner.'),
    });
  }

  private begin(): void {
    this.saving.set(true);
    this.actionError.set(null);
  }

  private fail(leadId: string, err: unknown, fallback: string): void {
    if (this.leadId !== leadId) return;
    this.saving.set(false);
    this.actionError.set(errorMessage(err, fallback));
  }

  /** Re-reads the first activity page after a change, without flashing the loading state. */
  private refreshActivity(): void {
    const leadId = this.leadId;
    if (!leadId || this.activity().status === 'idle') return;
    this.source.listActivity(leadId, null).subscribe({
      next: (page) => {
        if (this.leadId !== leadId) return;
        this.activityCursor = page.nextCursor;
        this.hasMoreActivity.set(page.nextCursor !== null);
        this.activity.set({ status: 'ready', items: page.items, error: null });
      },
      error: () => undefined,
    });
  }

  private load<T>(
    target: ReturnType<typeof signal<Section<T[]>>>,
    fetch: (leadId: string) => Observable<T[]>,
    fallback: string,
    map: (items: T[]) => T[] = (items) => items,
  ): void {
    const leadId = this.leadId;
    if (!leadId) return;
    target.update((s) => ({ ...s, status: 'loading', error: null }));
    fetch(leadId).subscribe({
      next: (items) => {
        if (this.leadId !== leadId) return;
        target.set({ status: 'ready', items: map(items), error: null });
      },
      error: (err) => {
        if (this.leadId !== leadId) return;
        target.set({ status: 'error', items: [], error: errorMessage(err, fallback) });
      },
    });
  }
}
