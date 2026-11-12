import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import type { MyTaskDto } from '@leads/shared';
import { CrmDataSource } from '../../../core/data/crm.data-source';
import { MyTasksCardComponent } from './my-tasks-card.component';

const task = (id: string, dueAt: string | null, title = id): MyTaskDto => ({
  id,
  leadId: 'l1',
  createdById: 'u1',
  assigneeId: 'u1',
  title,
  dueAt,
  doneAt: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  companyName: 'Acme',
});

describe('MyTasksCardComponent', () => {
  let fixture: ComponentFixture<MyTasksCardComponent>;
  let el: HTMLElement;
  const source = { myTasks: vi.fn(), updateTask: vi.fn() };

  async function render(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const rows = (): HTMLElement[] => Array.from(el.querySelectorAll('[data-testid="my-task"]'));

  beforeEach(async () => {
    source.myTasks.mockReset();
    source.updateTask.mockReset();
    await TestBed.configureTestingModule({
      imports: [MyTasksCardComponent],
      providers: [{ provide: CrmDataSource, useValue: source }],
    }).compileComponents();
    fixture = TestBed.createComponent(MyTasksCardComponent);
    el = fixture.nativeElement;
  });

  it('shows a busy loading state until the tasks arrive', async () => {
    const pending = new Subject<MyTaskDto[]>();
    source.myTasks.mockReturnValue(pending);
    fixture.detectChanges();
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(el.textContent).toContain('Loading tasks');
    pending.next([]);
    await render();
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('false');
  });

  it('shows an empty state without tasks', async () => {
    source.myTasks.mockReturnValue(of([]));
    await render();
    expect(el.querySelector('[data-testid="my-tasks-empty"]')).toBeTruthy();
    expect(el.querySelector('[data-testid="my-tasks-overdue"]')).toBeNull();
  });

  it('lists tasks in the given order with company and highlights overdue ones', async () => {
    source.myTasks.mockReturnValue(
      of([
        task('late', '2020-01-02T12:00:00.000Z', 'Overdue call'),
        task('soon', '2999-01-02T12:00:00.000Z', 'Future demo'),
        task('none', null, 'Someday'),
      ]),
    );
    await render();
    const items = rows();
    expect(items.map((r) => r.querySelector('label span')?.textContent?.trim())).toEqual([
      'Overdue call',
      'Future demo',
      'Someday',
    ]);
    expect(items[0].textContent).toContain('Acme');
    expect(items[0].textContent).toContain('Overdue ·');
    expect(items[0].className).toContain('text-red-400');
    expect(items[1].className).not.toContain('text-red-400');
    expect(items[2].textContent).toContain('No due date');
    expect(el.querySelector('[data-testid="my-tasks-overdue"]')?.textContent).toContain(
      '1 overdue',
    );
  });

  it('labels each checkbox through its task title', async () => {
    source.myTasks.mockReturnValue(of([task('a', null, 'Write')]));
    await render();
    const box = el.querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(el.querySelector(`label[for="${box.id}"]`)?.textContent).toContain('Write');
  });

  it('completes a task and removes it from the list', async () => {
    source.myTasks.mockReturnValue(of([task('a', null), task('b', null)]));
    source.updateTask.mockReturnValue(of(task('a', null)));
    await render();
    (rows()[0].querySelector('input') as HTMLInputElement).click();
    await render();
    expect(source.updateTask).toHaveBeenCalledWith('a', { done: true });
    expect(rows()).toHaveLength(1);
  });

  it('keeps the task and shows an alert when completing fails', async () => {
    source.myTasks.mockReturnValue(of([task('a', null)]));
    source.updateTask.mockReturnValue(throwError(() => new Error('Nope')));
    await render();
    (rows()[0].querySelector('input') as HTMLInputElement).click();
    await render();
    expect(rows()).toHaveLength(1);
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Nope');
  });

  it('shows an error with retry when loading fails', async () => {
    source.myTasks.mockReturnValueOnce(throwError(() => ({})));
    await render();
    expect(el.querySelector('[data-testid="my-tasks-error"]')?.textContent).toContain(
      'Could not load your tasks.',
    );
    source.myTasks.mockReturnValue(of([task('a', null)]));
    (el.querySelector('[data-testid="my-tasks-error"] button') as HTMLButtonElement).click();
    await render();
    expect(rows()).toHaveLength(1);
    expect(el.querySelector('[data-testid="my-tasks-error"]')).toBeNull();
  });
});
