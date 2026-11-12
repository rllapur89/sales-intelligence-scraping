import { TestBed } from '@angular/core/testing';
import { MockStore, provideMockStore } from '@ngrx/store/testing';
import { CrmDataSource } from '../../core/data/crm.data-source';
import { selectFilteredLeads } from '../../core/store/leads/leads.selectors';
import { makeLead } from '../../../testing/factories';
import { PipelineComponent } from './pipeline.component';

describe('PipelineComponent assignee badge', () => {
  const me = { id: 'u1', displayName: 'ana', role: 'user' as const };
  const leads = [
    makeLead({ id: 'mine', assigneeId: 'u1', company: { name: 'Mine Inc' } }),
    makeLead({ id: 'other', assigneeId: 'u2', company: { name: 'Other Inc' } }),
    makeLead({ id: 'free', assigneeId: null, company: { name: 'Free Inc' } }),
    makeLead({ id: 'legacy', company: { name: 'Legacy Inc' } }),
  ];

  /** Overridden selectors are module singletons: reset them so other specs see the real ones. */
  afterEach(() => TestBed.inject(MockStore).resetSelectors());

  async function render(): Promise<HTMLElement> {
    await TestBed.configureTestingModule({
      imports: [PipelineComponent],
      providers: [
        provideMockStore({ selectors: [{ selector: selectFilteredLeads, value: leads }] }),
        { provide: CrmDataSource, useValue: { currentUser: () => me } },
      ],
    }).compileComponents();
    const fixture = TestBed.createComponent(PipelineComponent);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  const cardOf = (el: HTMLElement, name: string): HTMLElement =>
    Array.from(el.querySelectorAll<HTMLElement>('.cursor-pointer')).find((c) =>
      c.textContent?.includes(name),
    ) as HTMLElement;

  it('shows my initial on my cards and ? on a teammate cards, with an accessible label', async () => {
    const el = await render();
    const mine = cardOf(el, 'Mine Inc').querySelector('[data-testid="assignee-badge"]');
    expect(mine?.textContent?.trim()).toBe('A');
    expect(mine?.getAttribute('role')).toBe('img');
    expect(mine?.getAttribute('aria-label')).toBe('Assigned to you');
    const other = cardOf(el, 'Other Inc').querySelector('[data-testid="assignee-badge"]');
    expect(other?.textContent?.trim()).toBe('?');
    expect(other?.getAttribute('aria-label')).toBe('Assigned to a teammate');
  });

  it('shows no badge for unassigned leads or leads without the field', async () => {
    const el = await render();
    expect(cardOf(el, 'Free Inc').querySelector('[data-testid="assignee-badge"]')).toBeNull();
    expect(cardOf(el, 'Legacy Inc').querySelector('[data-testid="assignee-badge"]')).toBeNull();
  });
});
