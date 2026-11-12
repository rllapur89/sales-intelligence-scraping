import { ChangeDetectionStrategy, Component, OnInit, inject, signal } from '@angular/core';
import type { MyTaskDto } from '@leads/shared';
import { dueState, isoToDueDate } from '../../../core/crm/crm-view';
import { CrmDataSource } from '../../../core/data/crm.data-source';
import { errorMessage } from '../../../core/util/errors';

/** Dashboard card: my open tasks, earliest due date first, overdue ones highlighted. */
@Component({
  selector: 'app-my-tasks-card',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <section
      class="bg-slate-900 border border-slate-800 rounded-xl p-4"
      aria-labelledby="my-tasks-heading"
      [attr.aria-busy]="loading()"
      data-testid="my-tasks"
    >
      <div class="flex items-center justify-between mb-3">
        <h3 id="my-tasks-heading" class="text-sm font-semibold text-white">My tasks</h3>
        @if (overdueCount() > 0) {
          <span
            class="text-[11px] px-2 py-0.5 rounded-full bg-red-500/15 text-red-400"
            data-testid="my-tasks-overdue"
          >
            {{ overdueCount() }} overdue
          </span>
        }
      </div>

      @if (actionError(); as message) {
        <p role="alert" class="mb-2 text-xs text-red-400">{{ message }}</p>
      }

      @if (loading()) {
        <p class="text-xs text-slate-500" role="status">Loading tasks…</p>
      } @else if (loadError(); as message) {
        <div class="text-xs text-red-400" role="alert" data-testid="my-tasks-error">
          {{ message }}
          <button type="button" (click)="load()" class="ml-1 underline cursor-pointer">
            Retry
          </button>
        </div>
      } @else if (tasks().length === 0) {
        <p class="text-xs text-slate-500" data-testid="my-tasks-empty">
          No open tasks. Create one from a lead's Tasks tab.
        </p>
      } @else {
        <ul class="space-y-2" aria-label="My open tasks, due first">
          @for (task of tasks(); track task.id) {
            <li
              class="flex items-start gap-2 text-sm"
              data-testid="my-task"
              [class.text-red-400]="isOverdue(task)"
            >
              <input
                type="checkbox"
                [id]="'my-task-' + task.id"
                (change)="complete(task)"
                class="mt-1 rounded border-slate-600 bg-slate-800 text-blue-500"
              />
              <label [for]="'my-task-' + task.id" class="min-w-0 flex-1 cursor-pointer">
                <span
                  class="block truncate"
                  [class]="isOverdue(task) ? 'text-red-300' : 'text-slate-200'"
                  >{{ task.title }}</span
                >
                <span class="block text-[11px] text-slate-500 truncate">{{
                  task.companyName
                }}</span>
              </label>
              <span
                class="shrink-0 text-[11px]"
                [class]="isOverdue(task) ? 'text-red-400 font-medium' : 'text-slate-500'"
              >
                {{ dueText(task) }}
              </span>
            </li>
          }
        </ul>
      }
    </section>
  `,
})
export class MyTasksCardComponent implements OnInit {
  private readonly source = inject(CrmDataSource);

  readonly tasks = signal<MyTaskDto[]>([]);
  readonly loading = signal(true);
  readonly loadError = signal<string | null>(null);
  readonly actionError = signal<string | null>(null);

  ngOnInit(): void {
    this.load();
  }

  load(): void {
    this.loading.set(true);
    this.loadError.set(null);
    this.source.myTasks().subscribe({
      next: (tasks) => {
        this.tasks.set(tasks);
        this.loading.set(false);
      },
      error: (err) => {
        this.loadError.set(errorMessage(err, 'Could not load your tasks.'));
        this.loading.set(false);
      },
    });
  }

  complete(task: MyTaskDto): void {
    this.actionError.set(null);
    this.source.updateTask(task.id, { done: true }).subscribe({
      next: () => this.tasks.update((list) => list.filter((t) => t.id !== task.id)),
      error: (err) => this.actionError.set(errorMessage(err, 'Could not complete the task.')),
    });
  }

  overdueCount(): number {
    return this.tasks().filter((t) => this.isOverdue(t)).length;
  }

  isOverdue(task: MyTaskDto): boolean {
    return dueState(task, new Date()) === 'overdue';
  }

  dueText(task: MyTaskDto): string {
    if (!task.dueAt) return 'No due date';
    const date = isoToDueDate(task.dueAt);
    const state = dueState(task, new Date());
    return state === 'overdue' ? `Overdue · ${date}` : state === 'today' ? 'Due today' : date;
  }
}
