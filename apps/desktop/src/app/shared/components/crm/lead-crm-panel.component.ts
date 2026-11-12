import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { FormsModule } from '@angular/forms';
import { Store } from '@ngrx/store';
import {
  NOTE_MAX_LENGTH,
  TASK_TITLE_MAX_LENGTH,
  type ActivityDto,
  type TaskDto,
} from '@leads/shared';
import {
  actorLabel,
  assigneeLabel,
  describeActivity,
  dueDateToIso,
  dueState,
  isoToDueDate,
} from '../../../core/crm/crm-view';
import { LeadCrmState } from '../../../core/crm/lead-crm.state';
import { Lead } from '../../../core/models/lead.model';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { RelativeTimePipe } from '../../pipes/relative-time.pipe';

export type CrmTab = 'notes' | 'activity' | 'tasks';

export const CRM_TABS: readonly { id: CrmTab; label: string }[] = [
  { id: 'notes', label: 'Notes' },
  { id: 'activity', label: 'Activity' },
  { id: 'tasks', label: 'Tasks' },
];

/** Notes, Activity and Tasks tabs plus the owner control of one lead (detail panel). */
@Component({
  selector: 'app-lead-crm-panel',
  standalone: true,
  imports: [FormsModule, RelativeTimePipe],
  providers: [LeadCrmState],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section aria-labelledby="crm-heading" data-testid="crm-panel">
      <h4
        id="crm-heading"
        class="text-xs font-semibold text-slate-400 uppercase tracking-widest mb-2"
      >
        CRM
      </h4>

      <!-- Owner -->
      <div
        class="flex items-center justify-between gap-2 py-1.5 border-b border-slate-800 text-sm"
        data-testid="crm-owner"
      >
        <span class="text-slate-500">Owner</span>
        <span class="flex items-center gap-2">
          <span class="text-slate-300">{{ ownerLabel() }}</span>
          @if (lead().assigneeId !== state.me.id) {
            <button
              type="button"
              (click)="assign(true)"
              class="text-xs text-blue-400 hover:text-blue-300 cursor-pointer"
            >
              Assign to me
            </button>
          }
          @if (lead().assigneeId) {
            <button
              type="button"
              (click)="assign(false)"
              class="text-xs text-slate-400 hover:text-white cursor-pointer"
            >
              Unassign
            </button>
          }
        </span>
      </div>

      <!-- Tabs -->
      <div role="tablist" aria-label="Lead CRM" class="flex gap-1 mt-3 border-b border-slate-800">
        @for (t of tabs; track t.id) {
          <button
            type="button"
            role="tab"
            [id]="'crm-tab-' + t.id"
            [attr.aria-selected]="tab() === t.id"
            [attr.aria-controls]="'crm-panel-' + t.id"
            [attr.tabindex]="tab() === t.id ? 0 : -1"
            (click)="tab.set(t.id)"
            (keydown.arrowRight)="moveTab(1)"
            (keydown.arrowLeft)="moveTab(-1)"
            class="px-3 py-1.5 text-xs rounded-t border-b-2 cursor-pointer"
            [class]="
              tab() === t.id
                ? 'border-blue-500 text-white'
                : 'border-transparent text-slate-400 hover:text-slate-200'
            "
          >
            {{ t.label }}
          </button>
        }
      </div>

      @if (state.actionError(); as message) {
        <p role="alert" class="mt-2 text-xs text-red-400" data-testid="crm-action-error">
          {{ message }}
        </p>
      }

      <!-- Notes -->
      @if (tab() === 'notes') {
        <div
          role="tabpanel"
          id="crm-panel-notes"
          aria-labelledby="crm-tab-notes"
          class="pt-3 space-y-3"
        >
          <form (ngSubmit)="submitNote()" class="space-y-1.5">
            <label for="crm-note-body" class="block text-xs text-slate-400">Add a note</label>
            <textarea
              id="crm-note-body"
              name="note"
              rows="3"
              [maxlength]="noteMax"
              [ngModel]="noteDraft()"
              (ngModelChange)="noteDraft.set($event)"
              [disabled]="state.saving()"
              class="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200 resize-y"
            ></textarea>
            <div class="flex items-center justify-between">
              <span class="text-[10px] text-slate-500" aria-live="polite"
                >{{ noteDraft().length }}/{{ noteMax }}</span
              >
              <button
                type="submit"
                [disabled]="state.saving()"
                class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded cursor-pointer"
              >
                Add note
              </button>
            </div>
          </form>

          @switch (state.notes().status) {
            @case ('loading') {
              <p class="text-xs text-slate-500" role="status">Loading notes…</p>
            }
            @case ('error') {
              <div class="text-xs text-red-400" role="alert">
                {{ state.notes().error }}
                <button
                  type="button"
                  (click)="state.loadNotes()"
                  class="ml-1 underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            }
            @default {
              @if (state.notes().items.length) {
                <ul class="space-y-2" aria-label="Notes">
                  @for (note of state.notes().items; track note.id) {
                    <li class="text-xs border-b border-slate-800 pb-2" data-testid="crm-note">
                      <div class="flex items-center justify-between gap-2 text-slate-500">
                        <span
                          >{{ authorLabel(note.authorId) }} ·
                          {{ note.createdAt | relativeTime }}</span
                        >
                        @if (state.canDeleteNote(note)) {
                          <button
                            type="button"
                            (click)="state.deleteNote(note)"
                            aria-label="Delete this note"
                            class="text-slate-500 hover:text-red-400 cursor-pointer"
                          >
                            Delete
                          </button>
                        }
                      </div>
                      <p class="mt-1 text-slate-300 whitespace-pre-wrap break-words">
                        {{ note.body }}
                      </p>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-xs text-slate-500" data-testid="crm-notes-empty">No notes yet.</p>
              }
            }
          }
        </div>
      }

      <!-- Activity -->
      @if (tab() === 'activity') {
        <div
          role="tabpanel"
          id="crm-panel-activity"
          aria-labelledby="crm-tab-activity"
          class="pt-3 space-y-2"
        >
          @switch (state.activity().status) {
            @case ('loading') {
              <p class="text-xs text-slate-500" role="status">Loading activity…</p>
            }
            @case ('error') {
              <div class="text-xs text-red-400" role="alert">
                {{ state.activity().error }}
                <button
                  type="button"
                  (click)="state.loadActivity()"
                  class="ml-1 underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            }
            @default {
              @if (state.activity().items.length) {
                <ol class="space-y-2" aria-label="Activity, newest first">
                  @for (a of state.activity().items; track a.id) {
                    <li class="text-xs border-b border-slate-800 pb-2" data-testid="crm-activity">
                      <div class="text-slate-300">{{ describe(a) }}</div>
                      <div class="text-slate-500">
                        {{ actor(a.actorId) }} · {{ a.createdAt | relativeTime }}
                      </div>
                    </li>
                  }
                </ol>
                @if (state.hasMoreActivity()) {
                  <button
                    type="button"
                    (click)="state.loadMoreActivity()"
                    [disabled]="state.loadingMoreActivity()"
                    class="text-xs text-blue-400 hover:text-blue-300 disabled:opacity-50 cursor-pointer"
                  >
                    {{ state.loadingMoreActivity() ? 'Loading…' : 'Load more' }}
                  </button>
                }
              } @else {
                <p class="text-xs text-slate-500" data-testid="crm-activity-empty">
                  No activity yet.
                </p>
              }
            }
          }
        </div>
      }

      <!-- Tasks -->
      @if (tab() === 'tasks') {
        <div
          role="tabpanel"
          id="crm-panel-tasks"
          aria-labelledby="crm-tab-tasks"
          class="pt-3 space-y-3"
        >
          <form (ngSubmit)="submitTask()" class="space-y-1.5">
            <label for="crm-task-title" class="block text-xs text-slate-400">New task</label>
            <input
              id="crm-task-title"
              name="title"
              type="text"
              [maxlength]="titleMax"
              [ngModel]="taskTitle()"
              (ngModelChange)="taskTitle.set($event)"
              [disabled]="state.saving()"
              class="w-full bg-slate-800 border border-slate-700 rounded px-2 py-1.5 text-xs text-slate-200"
            />
            <div class="flex items-center gap-2">
              <label for="crm-task-due" class="text-xs text-slate-400">Due date</label>
              <input
                id="crm-task-due"
                name="due"
                type="date"
                [ngModel]="taskDue()"
                (ngModelChange)="taskDue.set($event)"
                [disabled]="state.saving()"
                class="bg-slate-800 border border-slate-700 rounded px-2 py-1 text-xs text-slate-200"
              />
            </div>
            <div class="flex items-center justify-between">
              <label class="flex items-center gap-1.5 text-xs text-slate-400 cursor-pointer">
                <input
                  type="checkbox"
                  name="mine"
                  [ngModel]="taskToMe()"
                  (ngModelChange)="taskToMe.set($event)"
                  class="rounded border-slate-600 bg-slate-800 text-blue-500"
                />
                Assign to me
              </label>
              <button
                type="submit"
                [disabled]="state.saving()"
                class="px-3 py-1 text-xs bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white rounded cursor-pointer"
              >
                Add task
              </button>
            </div>
          </form>

          @switch (state.tasks().status) {
            @case ('loading') {
              <p class="text-xs text-slate-500" role="status">Loading tasks…</p>
            }
            @case ('error') {
              <div class="text-xs text-red-400" role="alert">
                {{ state.tasks().error }}
                <button
                  type="button"
                  (click)="state.loadTasks()"
                  class="ml-1 underline cursor-pointer"
                >
                  Retry
                </button>
              </div>
            }
            @default {
              @if (state.tasks().items.length) {
                <ul class="space-y-1.5" aria-label="Tasks">
                  @for (task of state.tasks().items; track task.id) {
                    <li class="flex items-start gap-2 text-xs" data-testid="crm-task">
                      <input
                        type="checkbox"
                        [id]="'crm-task-' + task.id"
                        [checked]="task.doneAt !== null"
                        (change)="state.toggleTask(task)"
                        class="mt-0.5 rounded border-slate-600 bg-slate-800 text-blue-500"
                      />
                      <label [for]="'crm-task-' + task.id" class="min-w-0 cursor-pointer">
                        <span
                          class="block break-words"
                          [class]="task.doneAt ? 'text-slate-500 line-through' : 'text-slate-200'"
                          >{{ task.title }}</span
                        >
                        @if (dueText(task); as due) {
                          <span class="block" [class]="dueClass(task)">{{ due }}</span>
                        }
                      </label>
                    </li>
                  }
                </ul>
              } @else {
                <p class="text-xs text-slate-500" data-testid="crm-tasks-empty">No tasks yet.</p>
              }
            }
          }
        </div>
      }
    </section>
  `,
})
export class LeadCrmPanelComponent {
  readonly lead = input.required<Lead>();
  readonly state = inject(LeadCrmState);
  private readonly store = inject(Store);

  readonly tabs = CRM_TABS;
  readonly noteMax = NOTE_MAX_LENGTH;
  readonly titleMax = TASK_TITLE_MAX_LENGTH;
  readonly tab = signal<CrmTab>('notes');
  readonly noteDraft = signal('');
  readonly taskTitle = signal('');
  readonly taskDue = signal('');
  readonly taskToMe = signal(true);

  readonly ownerLabel = computed(() => assigneeLabel(this.lead().assigneeId, this.state.me.id));
  private readonly leadId = computed(() => this.lead().id);

  constructor() {
    effect(() => {
      const id = this.leadId();
      this.noteDraft.set('');
      this.taskTitle.set('');
      this.taskDue.set('');
      untracked(() => this.state.open(id));
    });
  }

  moveTab(step: 1 | -1): void {
    const index = this.tabs.findIndex((t) => t.id === this.tab());
    const next = this.tabs[(index + step + this.tabs.length) % this.tabs.length];
    this.tab.set(next.id);
    document.getElementById(`crm-tab-${next.id}`)?.focus();
  }

  submitNote(): void {
    this.state.addNote(this.noteDraft(), () => this.noteDraft.set(''));
  }

  submitTask(): void {
    const dueAt = this.taskDue() ? dueDateToIso(this.taskDue()) : null;
    this.state.addTask(this.taskTitle(), dueAt, this.taskToMe(), () => {
      this.taskTitle.set('');
      this.taskDue.set('');
    });
  }

  assign(toMe: boolean): void {
    this.state.assign(this.lead(), toMe, (saved) =>
      this.store.dispatch(LeadsActions.updateLeadSuccess({ lead: saved })),
    );
  }

  authorLabel(authorId: string): string {
    return actorLabel(authorId, this.state.me.id);
  }

  actor(actorId: string | null): string {
    return actorLabel(actorId, this.state.me.id);
  }

  describe(activity: ActivityDto): string {
    return describeActivity(activity, this.state.me.id);
  }

  dueText(task: TaskDto): string {
    if (!task.dueAt) return '';
    const date = isoToDueDate(task.dueAt);
    const state = dueState(task, new Date());
    return state === 'overdue'
      ? `Overdue · ${date}`
      : state === 'today'
        ? `Due today · ${date}`
        : `Due ${date}`;
  }

  dueClass(task: TaskDto): string {
    return dueState(task, new Date()) === 'overdue' ? 'text-red-400 font-medium' : 'text-slate-500';
  }
}
