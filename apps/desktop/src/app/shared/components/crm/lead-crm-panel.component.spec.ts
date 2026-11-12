import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Store, provideStore } from '@ngrx/store';
import { CrmDataSource, MOCK_USER, MockCrmDataSource } from '../../../core/data/crm.data-source';
import { LeadsActions } from '../../../core/store/leads/leads.actions';
import { MockDataService } from '../../../core/services/mock-data.service';
import { makeLead } from '../../../../testing/factories';
import { LeadCrmPanelComponent } from './lead-crm-panel.component';

describe('LeadCrmPanelComponent', () => {
  let fixture: ComponentFixture<LeadCrmPanelComponent>;
  let el: HTMLElement;
  let dispatch: ReturnType<typeof vi.spyOn>;
  const lead = makeLead({ id: 'l1' });

  async function render(value = lead): Promise<void> {
    fixture.componentRef.setInput('lead', value);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const q = <T extends HTMLElement>(selector: string): T => el.querySelector(selector) as T;
  const all = (selector: string): HTMLElement[] => Array.from(el.querySelectorAll(selector));

  async function type(selector: string, value: string): Promise<void> {
    const input = q<HTMLInputElement | HTMLTextAreaElement>(selector);
    input.value = value;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function click(selector: string): Promise<void> {
    q(selector).click();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  async function submit(selector: string): Promise<void> {
    q<HTMLFormElement>(selector).dispatchEvent(new Event('submit'));
    await fixture.whenStable();
    fixture.detectChanges();
  }

  const openTab = (name: string): Promise<void> => click(`#crm-tab-${name}`);

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [LeadCrmPanelComponent],
      providers: [
        provideStore({}),
        { provide: CrmDataSource, useClass: MockCrmDataSource },
        { provide: MockDataService, useValue: { getLeads: () => [lead] } },
      ],
    }).compileComponents();
    dispatch = vi.spyOn(TestBed.inject(Store), 'dispatch');
    fixture = TestBed.createComponent(LeadCrmPanelComponent);
    el = fixture.nativeElement;
  });

  it('shows the three tabs with ARIA roles, Notes selected first, and an empty notes state', async () => {
    await render();
    const tabs = all('[role="tab"]');
    expect(tabs.map((t) => t.textContent?.trim())).toEqual(['Notes', 'Activity', 'Tasks']);
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(q('[role="tabpanel"]').getAttribute('aria-labelledby')).toBe('crm-tab-notes');
    expect(q('[data-testid="crm-notes-empty"]').textContent).toContain('No notes yet');
    expect(q('label[for="crm-note-body"]')).toBeTruthy();
  });

  it('adds a note, clears the form and lists it with a delete action', async () => {
    await render();
    await type('#crm-note-body', '  Call them next week ');
    expect(el.textContent).toContain('22/2000');
    await submit('form');
    const notes = all('[data-testid="crm-note"]');
    expect(notes).toHaveLength(1);
    expect(notes[0].textContent).toContain('Call them next week');
    expect(notes[0].textContent).toContain('You');
    expect(q<HTMLTextAreaElement>('#crm-note-body').value).toBe('');
    expect(q('button[aria-label="Delete this note"]')).toBeTruthy();

    await click('button[aria-label="Delete this note"]');
    expect(q('[data-testid="crm-notes-empty"]')).toBeTruthy();
  });

  it('shows an alert for an empty note and keeps the list unchanged', async () => {
    await render();
    await type('#crm-note-body', '   ');
    await submit('form');
    expect(q('[role="alert"]').textContent).toContain('Write something');
    expect(all('[data-testid="crm-note"]')).toHaveLength(0);
  });

  it('creates tasks with a due date, completes them and highlights overdue ones', async () => {
    await render();
    await openTab('tasks');
    expect(q('[data-testid="crm-tasks-empty"]')).toBeTruthy();

    await type('#crm-task-title', 'Send proposal');
    await type('#crm-task-due', '2020-01-15');
    await submit('form');
    const rows = all('[data-testid="crm-task"]');
    expect(rows).toHaveLength(1);
    expect(rows[0].textContent).toContain('Send proposal');
    expect(rows[0].textContent).toContain('Overdue · 2020-01-15');
    expect(rows[0].querySelector('.text-red-400')).toBeTruthy();
    expect(q<HTMLInputElement>('#crm-task-title').value).toBe('');

    const checkbox = rows[0].querySelector('input[type="checkbox"]') as HTMLInputElement;
    expect(rows[0].querySelector('label')?.getAttribute('for')).toBe(checkbox.id);
    checkbox.click();
    await fixture.whenStable();
    fixture.detectChanges();
    const done = q('[data-testid="crm-task"]');
    expect(done.querySelector('.line-through')).toBeTruthy();
    expect(done.textContent).not.toContain('Overdue');
  });

  it('records the timeline and lists it newest first in the Activity tab', async () => {
    await render();
    await type('#crm-note-body', 'hello');
    await submit('form');
    await openTab('activity');
    const items = all('[data-testid="crm-activity"]');
    expect(items).toHaveLength(1);
    expect(items[0].textContent).toContain('Note added');
    expect(items[0].textContent).toContain('You');
    expect(el.textContent).not.toContain('hello');
  });

  it('shows an empty activity state for a lead without history', async () => {
    await render();
    await openTab('activity');
    expect(q('[data-testid="crm-activity-empty"]')).toBeTruthy();
  });

  it('moves between tabs with the arrow keys', async () => {
    await render();
    q('#crm-tab-notes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' }));
    fixture.detectChanges();
    expect(q('#crm-tab-activity').getAttribute('aria-selected')).toBe('true');
    q('#crm-tab-activity').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    q('#crm-tab-notes').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' }));
    fixture.detectChanges();
    expect(q('#crm-tab-tasks').getAttribute('aria-selected')).toBe('true');
  });

  it('assigns the lead to me and dispatches the saved lead to the store', async () => {
    await render();
    expect(q('[data-testid="crm-owner"]').textContent).toContain('Unassigned');
    await click('[data-testid="crm-owner"] button');
    expect(dispatch).toHaveBeenCalledWith(
      LeadsActions.updateLeadSuccess({ lead: { ...lead, assigneeId: MOCK_USER.id } }),
    );
  });

  it('offers unassign for an owned lead and hides assign-to-me', async () => {
    await render({ ...lead, assigneeId: MOCK_USER.id });
    const buttons = all('[data-testid="crm-owner"] button').map((b) => b.textContent?.trim());
    expect(buttons).toEqual(['Unassign']);
    expect(q('[data-testid="crm-owner"]').textContent).toContain('Assigned to you');
    await click('[data-testid="crm-owner"] button');
    expect(dispatch).toHaveBeenCalledWith(
      LeadsActions.updateLeadSuccess({ lead: { ...lead, assigneeId: null } }),
    );
  });

  it('reloads the sections when another lead is shown', async () => {
    await render();
    await type('#crm-note-body', 'on l1');
    await submit('form');
    expect(all('[data-testid="crm-note"]')).toHaveLength(1);
    await render({ ...lead, id: 'l2' });
    expect(all('[data-testid="crm-note"]')).toHaveLength(0);
  });
});
