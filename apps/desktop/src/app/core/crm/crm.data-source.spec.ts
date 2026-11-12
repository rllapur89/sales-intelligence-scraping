import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { firstValueFrom } from 'rxjs';
import { AuthService } from '../auth/auth.service';
import { ENVIRONMENT } from '../config/app-environment';
import { environment } from '../../../environments/environment';
import { MockDataService } from '../services/mock-data.service';
import { makeLead } from '../../../testing/factories';
import { provideDataSources } from '../data/data-sources.provider';
import {
  ACTIVITY_PAGE_SIZE,
  CrmDataSource,
  LiveCrmDataSource,
  MOCK_USER,
  MockCrmDataSource,
} from '../data/crm.data-source';

describe('CrmDataSource', () => {
  it('provideDataSources picks the mock or the live implementation', () => {
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources('mock')],
    });
    expect(TestBed.inject(CrmDataSource)).toBeInstanceOf(MockCrmDataSource);

    TestBed.resetTestingModule();
    TestBed.configureTestingModule({
      providers: [provideHttpClient(), provideHttpClientTesting(), ...provideDataSources('live')],
    });
    expect(TestBed.inject(CrmDataSource)).toBeInstanceOf(LiveCrmDataSource);
  });

  describe('mock', () => {
    const leads = [makeLead({ id: 'l1', company: { name: 'Acme' } }), makeLead({ id: 'l2' })];
    let source: MockCrmDataSource;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          MockCrmDataSource,
          { provide: MockDataService, useValue: { getLeads: () => leads } },
        ],
      });
      source = TestBed.inject(MockCrmDataSource);
    });

    it('adds, lists per lead (newest first) and deletes notes', async () => {
      await firstValueFrom(source.addNote('l1', '  first '));
      const second = await firstValueFrom(source.addNote('l1', 'second'));
      await firstValueFrom(source.addNote('l2', 'other lead'));
      const notes = await firstValueFrom(source.listNotes('l1'));
      expect(notes.map((n) => n.body)).toEqual(['second', 'first']);
      expect(notes[0].authorId).toBe(MOCK_USER.id);

      await firstValueFrom(source.deleteNote('l1', second.id));
      expect((await firstValueFrom(source.listNotes('l1'))).map((n) => n.body)).toEqual(['first']);
      await expect(firstValueFrom(source.deleteNote('l1', 'nope'))).rejects.toThrow('not found');
    });

    it('rejects blank and over-long notes without storing them', async () => {
      await expect(firstValueFrom(source.addNote('l1', '  '))).rejects.toThrow('Write something');
      await expect(firstValueFrom(source.addNote('l1', 'a'.repeat(2001)))).rejects.toThrow('2000');
      expect(await firstValueFrom(source.listNotes('l1'))).toEqual([]);
    });

    it('records note, task and assignment activity newest first without note text', async () => {
      await firstValueFrom(source.addNote('l1', 'secret text'));
      const task = await firstValueFrom(source.addTask('l1', { title: 'Call' }));
      await firstValueFrom(source.updateTask(task.id, { done: true }));
      await firstValueFrom(source.assign(leads[0], MOCK_USER.id));
      const page = await firstValueFrom(source.listActivity('l1', null));
      expect(page.items.map((a) => a.type)).toEqual([
        'assigned',
        'task_completed',
        'task_created',
        'note_added',
      ]);
      expect(JSON.stringify(page.items)).not.toContain('secret text');
      expect(page.nextCursor).toBeNull();
    });

    it('paginates activity with an offset cursor', async () => {
      for (let i = 0; i < ACTIVITY_PAGE_SIZE + 3; i++) {
        await firstValueFrom(source.addNote('l1', `n${i}`));
      }
      const first = await firstValueFrom(source.listActivity('l1', null));
      expect(first.items).toHaveLength(ACTIVITY_PAGE_SIZE);
      expect(first.nextCursor).toBe(String(ACTIVITY_PAGE_SIZE));
      const second = await firstValueFrom(source.listActivity('l1', first.nextCursor));
      expect(second.items).toHaveLength(3);
      expect(second.nextCursor).toBeNull();
      await expect(firstValueFrom(source.listActivity('l1', 'x'))).rejects.toThrow('Invalid');
    });

    it('assigns tasks to me by default, supports unassigned and completes once', async () => {
      const mine = await firstValueFrom(source.addTask('l1', { title: 'Mine' }));
      const free = await firstValueFrom(source.addTask('l1', { title: 'Free', assigneeId: null }));
      expect(mine.assigneeId).toBe(MOCK_USER.id);
      expect(free.assigneeId).toBeNull();

      const done = await firstValueFrom(source.updateTask(mine.id, { done: true }));
      expect(done.doneAt).not.toBeNull();
      await firstValueFrom(source.updateTask(mine.id, { done: true }));
      const types = (await firstValueFrom(source.listActivity('l1', null))).items.map(
        (a) => a.type,
      );
      expect(types.filter((t) => t === 'task_completed')).toHaveLength(1);

      const reopened = await firstValueFrom(source.updateTask(mine.id, { done: false }));
      expect(reopened.doneAt).toBeNull();
    });

    it('lists lead tasks open first and rejects invalid task input', async () => {
      const a = await firstValueFrom(source.addTask('l1', { title: 'A' }));
      await firstValueFrom(source.addTask('l1', { title: 'B' }));
      await firstValueFrom(source.updateTask(a.id, { done: true }));
      expect((await firstValueFrom(source.listTasks('l1'))).map((t) => t.title)).toEqual([
        'B',
        'A',
      ]);
      await expect(firstValueFrom(source.addTask('l1', { title: ' ' }))).rejects.toThrow('title');
      await expect(firstValueFrom(source.updateTask(a.id, { title: '' }))).rejects.toThrow('title');
      await expect(firstValueFrom(source.updateTask('nope', {}))).rejects.toThrow('not found');
    });

    it('myTasks returns only my open tasks, due first with nulls last, with company names', async () => {
      const late = new Date(2026, 5, 1).toISOString();
      const soon = new Date(2026, 1, 1).toISOString();
      await firstValueFrom(source.addTask('l2', { title: 'No due' }));
      await firstValueFrom(source.addTask('l1', { title: 'Late', dueAt: late }));
      await firstValueFrom(source.addTask('l1', { title: 'Soon', dueAt: soon }));
      await firstValueFrom(source.addTask('l1', { title: 'Not mine', assigneeId: null }));
      const finished = await firstValueFrom(source.addTask('l1', { title: 'Done', dueAt: soon }));
      await firstValueFrom(source.updateTask(finished.id, { done: true }));

      const mine = await firstValueFrom(source.myTasks());
      expect(mine.map((t) => t.title)).toEqual(['Soon', 'Late', 'No due']);
      expect(mine.map((t) => t.companyName)).toEqual(['Acme', 'Acme', 'Acme']);
    });

    it('assign sets and clears the owner and logs only real changes', async () => {
      const assigned = await firstValueFrom(source.assign(leads[0], MOCK_USER.id));
      expect(assigned.assigneeId).toBe(MOCK_USER.id);
      await firstValueFrom(source.assign(assigned, MOCK_USER.id));
      const cleared = await firstValueFrom(source.assign(assigned, null));
      expect(cleared.assigneeId).toBeNull();
      const page = await firstValueFrom(source.listActivity('l1', null));
      expect(page.items.map((a) => a.data)).toEqual([
        { from: MOCK_USER.id, to: null },
        { from: null, to: MOCK_USER.id },
      ]);
    });
  });

  describe('live', () => {
    let source: LiveCrmDataSource;
    let http: HttpTestingController;

    beforeEach(() => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          {
            provide: ENVIRONMENT,
            useValue: { ...environment, dataMode: 'live', apiUrl: 'http://api.test/api' },
          },
          {
            provide: AuthService,
            useValue: { user: () => ({ id: 'u1', displayName: 'Ana', role: 'admin' }) },
          },
          LiveCrmDataSource,
        ],
      });
      source = TestBed.inject(LiveCrmDataSource);
      http = TestBed.inject(HttpTestingController);
    });

    afterEach(() => http.verify());

    it('exposes the signed-in user', () => {
      expect(source.currentUser()).toEqual({ id: 'u1', displayName: 'Ana', role: 'admin' });
    });

    it('calls the notes endpoints', () => {
      source.listNotes('l 1').subscribe();
      http.expectOne({ method: 'GET', url: 'http://api.test/api/leads/l%201/notes' }).flush([]);

      source.addNote('l1', '  hi ').subscribe();
      const post = http.expectOne({ method: 'POST', url: 'http://api.test/api/leads/l1/notes' });
      expect(post.request.body).toEqual({ body: 'hi' });
      post.flush({});

      source.deleteNote('l1', 'n1').subscribe();
      http
        .expectOne({ method: 'DELETE', url: 'http://api.test/api/leads/l1/notes/n1' })
        .flush(null, { status: 204, statusText: 'No Content' });
    });

    it('requests activity pages with limit and cursor', () => {
      source.listActivity('l1', null).subscribe();
      const first = http.expectOne((r) => r.url === 'http://api.test/api/leads/l1/activity');
      expect(first.request.params.get('limit')).toBe(String(ACTIVITY_PAGE_SIZE));
      expect(first.request.params.has('cursor')).toBe(false);
      first.flush({ items: [], nextCursor: null });

      source.listActivity('l1', 'abc').subscribe();
      const next = http.expectOne((r) => r.url === 'http://api.test/api/leads/l1/activity');
      expect(next.request.params.get('cursor')).toBe('abc');
      next.flush({ items: [], nextCursor: null });
    });

    it('creates and patches tasks, sending only the provided fields', () => {
      source.addTask('l1', { title: ' Call ' }).subscribe();
      const bare = http.expectOne({ method: 'POST', url: 'http://api.test/api/leads/l1/tasks' });
      expect(bare.request.body).toEqual({ title: 'Call' });
      bare.flush({});

      source.addTask('l1', { title: 'Call', dueAt: null, assigneeId: null }).subscribe();
      const full = http.expectOne({ method: 'POST', url: 'http://api.test/api/leads/l1/tasks' });
      expect(full.request.body).toEqual({ title: 'Call', dueAt: null, assigneeId: null });
      full.flush({});

      source.updateTask('t1', { done: true }).subscribe();
      const patch = http.expectOne({ method: 'PATCH', url: 'http://api.test/api/tasks/t1' });
      expect(patch.request.body).toEqual({ done: true });
      patch.flush({});

      source.listTasks('l1').subscribe();
      http.expectOne({ method: 'GET', url: 'http://api.test/api/leads/l1/tasks' }).flush([]);
      source.myTasks().subscribe();
      http.expectOne({ method: 'GET', url: 'http://api.test/api/tasks/mine' }).flush([]);
    });

    it('assigns through PATCH /leads/:id/assignee and emits the server lead', async () => {
      const lead = makeLead({ id: 'l1' });
      const result = firstValueFrom(source.assign(lead, null));
      const req = http.expectOne({ method: 'PATCH', url: 'http://api.test/api/leads/l1/assignee' });
      expect(req.request.body).toEqual({ assigneeId: null });
      req.flush({ ...lead, assigneeId: null });
      expect((await result).assigneeId).toBeNull();
    });
  });

  describe('live without a session', () => {
    it('falls back to an empty identity', () => {
      TestBed.configureTestingModule({
        providers: [
          provideHttpClient(),
          provideHttpClientTesting(),
          { provide: AuthService, useValue: { user: () => null } },
          LiveCrmDataSource,
        ],
      });
      expect(TestBed.inject(LiveCrmDataSource).currentUser().id).toBe('');
    });
  });
});
