import { TestBed } from '@angular/core/testing';
import { Subject, of, throwError } from 'rxjs';
import type { NoteDto, TaskDto } from '@leads/shared';
import { makeLead } from '../../../testing/factories';
import {
  ACTIVITY_PAGE_SIZE,
  CrmDataSource,
  MOCK_USER,
  MockCrmDataSource,
} from '../data/crm.data-source';
import { MockDataService } from '../services/mock-data.service';
import { LeadCrmState, openFirst } from './lead-crm.state';

const task = (id: string, doneAt: string | null = null): TaskDto => ({
  id,
  leadId: 'l1',
  createdById: 'u1',
  assigneeId: 'u1',
  title: id,
  dueAt: null,
  doneAt,
  createdAt: '2026-02-01T00:00:00.000Z',
});

describe('openFirst', () => {
  it('puts open tasks before done ones, keeping the order inside each group', () => {
    const sorted = openFirst([task('a', 'x'), task('b'), task('c', 'y'), task('d')]);
    expect(sorted.map((t) => t.id)).toEqual(['b', 'd', 'a', 'c']);
  });
});

describe('LeadCrmState with the mock source', () => {
  let state: LeadCrmState;
  const lead = makeLead({ id: 'l1' });

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        LeadCrmState,
        { provide: CrmDataSource, useClass: MockCrmDataSource },
        { provide: MockDataService, useValue: { getLeads: () => [lead] } },
      ],
    });
    state = TestBed.inject(LeadCrmState);
    state.open('l1');
  });

  it('loads the three sections as ready and empty for a new lead', () => {
    expect(state.notes().status).toBe('ready');
    expect(state.tasks().status).toBe('ready');
    expect(state.activity().status).toBe('ready');
    expect(state.notes().items).toEqual([]);
    expect(state.hasMoreActivity()).toBe(false);
  });

  it('adds a note, prepends it, refreshes activity and calls onSaved', () => {
    const saved = vi.fn();
    state.addNote(' hello ', saved);
    expect(state.notes().items.map((n) => n.body)).toEqual(['hello']);
    expect(state.activity().items.map((a) => a.type)).toEqual(['note_added']);
    expect(state.saving()).toBe(false);
    expect(state.actionError()).toBeNull();
    expect(saved).toHaveBeenCalledTimes(1);
  });

  it('rejects an invalid note locally without calling the source', () => {
    const saved = vi.fn();
    state.addNote('   ', saved);
    expect(state.actionError()).toContain('Write something');
    expect(state.notes().items).toEqual([]);
    expect(saved).not.toHaveBeenCalled();
    state.addNote('a'.repeat(2001));
    expect(state.actionError()).toContain('2000');
  });

  it('deletes only notes the user may delete', () => {
    state.addNote('mine');
    const mine = state.notes().items[0];
    expect(state.canDeleteNote(mine)).toBe(true);
    const foreign: NoteDto = { ...mine, id: 'x', authorId: 'someone-else' };
    expect(state.canDeleteNote(foreign)).toBe(false);
    state.deleteNote(foreign);
    expect(state.notes().items).toHaveLength(1);
    state.deleteNote(mine);
    expect(state.notes().items).toEqual([]);
  });

  it('creates tasks assigned to me or unassigned, open tasks first', () => {
    state.addTask('Call', null, true);
    state.addTask('Email', '2026-03-01T10:00:00.000Z', false);
    const items = state.tasks().items;
    expect(items.map((t) => t.title)).toEqual(['Call', 'Email']);
    expect(items.map((t) => t.assigneeId)).toEqual([MOCK_USER.id, null]);
    expect(items[1].dueAt).toBe('2026-03-01T10:00:00.000Z');
  });

  it('validates the title and ignores submits while saving', () => {
    state.addTask(' ', null, true);
    expect(state.actionError()).toContain('title');
    expect(state.tasks().items).toEqual([]);
    state.saving.set(true);
    state.addTask('Call', null, true);
    expect(state.tasks().items).toEqual([]);
  });

  it('completes and reopens a task, moving done tasks last', () => {
    state.addTask('A', null, true);
    state.addTask('B', null, true);
    state.toggleTask(state.tasks().items[0]);
    expect(state.tasks().items.map((t) => [t.title, t.doneAt !== null])).toEqual([
      ['B', false],
      ['A', true],
    ]);
    state.toggleTask(state.tasks().items[1]);
    expect(state.tasks().items.every((t) => t.doneAt === null)).toBe(true);
  });

  it('assigns to me or unassigns and hands the saved lead to the caller', () => {
    const saved = vi.fn();
    state.assign(lead, true, saved);
    expect(saved).toHaveBeenLastCalledWith({ ...lead, assigneeId: MOCK_USER.id });
    state.assign({ ...lead, assigneeId: MOCK_USER.id }, false, saved);
    expect(saved).toHaveBeenLastCalledWith({ ...lead, assigneeId: null });
    expect(state.activity().items.map((a) => a.type)).toEqual(['assigned', 'assigned']);
  });

  it('pages the activity with load more', () => {
    for (let i = 0; i < ACTIVITY_PAGE_SIZE + 2; i++) state.addNote(`n${i}`);
    expect(state.activity().items).toHaveLength(ACTIVITY_PAGE_SIZE);
    expect(state.hasMoreActivity()).toBe(true);
    state.loadMoreActivity();
    expect(state.activity().items).toHaveLength(ACTIVITY_PAGE_SIZE + 2);
    expect(state.hasMoreActivity()).toBe(false);
    state.loadMoreActivity();
    expect(state.activity().items).toHaveLength(ACTIVITY_PAGE_SIZE + 2);
  });

  it('resets everything when another lead is opened', () => {
    state.addNote('on l1');
    state.open('l2');
    expect(state.notes().items).toEqual([]);
    expect(state.activity().items).toEqual([]);
    expect(state.actionError()).toBeNull();
  });
});

describe('LeadCrmState failure and race handling', () => {
  const notes$ = new Subject<NoteDto[]>();
  const source = {
    currentUser: vi.fn(),
    listNotes: vi.fn(),
    listTasks: vi.fn(),
    listActivity: vi.fn(),
    addNote: vi.fn(),
    deleteNote: vi.fn(),
    addTask: vi.fn(),
    updateTask: vi.fn(),
    assign: vi.fn(),
  };
  let state: LeadCrmState;

  beforeEach(() => {
    for (const fn of Object.values(source)) fn.mockReset();
    source.currentUser.mockReturnValue(MOCK_USER);
    source.listNotes.mockReturnValue(of([]));
    source.listTasks.mockReturnValue(of([]));
    source.listActivity.mockReturnValue(of({ items: [], nextCursor: null }));
    TestBed.configureTestingModule({
      providers: [LeadCrmState, { provide: CrmDataSource, useValue: source }],
    });
    state = TestBed.inject(LeadCrmState);
  });

  it('shows a section error with the server message and recovers on retry', () => {
    source.listNotes.mockReturnValueOnce(throwError(() => new Error('boom')));
    source.listTasks.mockReturnValueOnce(throwError(() => ({})));
    state.open('l1');
    expect(state.notes()).toEqual({ status: 'error', items: [], error: 'boom' });
    expect(state.tasks().error).toBe('Could not load the tasks.');
    state.loadNotes();
    expect(state.notes().status).toBe('ready');
  });

  it('keeps the form data and shows an error when saving fails', () => {
    state.open('l1');
    source.addNote.mockReturnValue(throwError(() => new Error('Server said no')));
    const saved = vi.fn();
    state.addNote('hello', saved);
    expect(state.actionError()).toBe('Server said no');
    expect(state.saving()).toBe(false);
    expect(saved).not.toHaveBeenCalled();
    expect(state.notes().items).toEqual([]);
  });

  it('reports delete, task and assign failures without changing data', () => {
    state.open('l1');
    state.notes.set({
      status: 'ready',
      items: [{ id: 'n1', leadId: 'l1', authorId: MOCK_USER.id, body: 'x', createdAt: 'd' }],
      error: null,
    });
    source.deleteNote.mockReturnValue(throwError(() => new Error('nope')));
    state.deleteNote(state.notes().items[0]);
    expect(state.actionError()).toBe('nope');
    expect(state.notes().items).toHaveLength(1);

    source.updateTask.mockReturnValue(throwError(() => ({})));
    state.toggleTask(task('t1'));
    expect(state.actionError()).toBe('Could not update the task.');

    source.assign.mockReturnValue(throwError(() => ({})));
    const saved = vi.fn();
    state.assign(makeLead({ id: 'l1' }), true, saved);
    expect(state.actionError()).toBe('Could not change the owner.');
    expect(saved).not.toHaveBeenCalled();
  });

  it('drops answers that arrive after another lead was opened', () => {
    source.listNotes.mockReturnValueOnce(notes$);
    state.open('l1');
    state.open('l2');
    notes$.next([{ id: 'n1', leadId: 'l1', authorId: 'u', body: 'stale', createdAt: 'd' }]);
    expect(state.notes().items).toEqual([]);
  });

  it('does nothing before a lead is opened', () => {
    state.addNote('x');
    state.addTask('x', null, true);
    state.loadMoreActivity();
    expect(source.addNote).not.toHaveBeenCalled();
    expect(source.addTask).not.toHaveBeenCalled();
  });
});
