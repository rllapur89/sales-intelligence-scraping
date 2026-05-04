import { TestBed, ComponentFixture } from '@angular/core/testing';
import { StatusBadgeComponent } from './status-badge.component';

describe('StatusBadgeComponent', () => {
  let component: StatusBadgeComponent;
  let fixture: ComponentFixture<StatusBadgeComponent>;

  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [StatusBadgeComponent],
    }).compileComponents();

    fixture = TestBed.createComponent(StatusBadgeComponent);
    component = fixture.componentInstance;
  });

  it('creates', async () => {
    await fixture.whenStable();
    expect(component).toBeTruthy();
  });

  it('renders value as text content', async () => {
    component.value = 'new';
    await fixture.whenStable();
    const span: HTMLElement = fixture.nativeElement.querySelector('span');
    expect(span.textContent?.trim()).toBe('new');
  });

  describe('cssClass — lead type', () => {
    beforeEach(() => { component.type = 'lead'; });

    it('"new" → blue', () => {
      component.value = 'new';
      expect(component.cssClass).toContain('bg-blue-500/15');
    });

    it('"contacted" → yellow', () => {
      component.value = 'contacted';
      expect(component.cssClass).toContain('bg-yellow-500/15');
    });

    it('"qualified" → purple', () => {
      component.value = 'qualified';
      expect(component.cssClass).toContain('bg-purple-500/15');
    });

    it('"won" → emerald', () => {
      component.value = 'won';
      expect(component.cssClass).toContain('bg-emerald-500/15');
    });

    it('"lost" → red', () => {
      component.value = 'lost';
      expect(component.cssClass).toContain('bg-red-500/15');
    });
  });

  describe('cssClass — scraping type', () => {
    beforeEach(() => { component.type = 'scraping'; });

    it('"updated" → emerald', () => {
      component.value = 'updated';
      expect(component.cssClass).toContain('bg-emerald-500/15');
    });

    it('"validating" → animate-pulse', () => {
      component.value = 'validating';
      expect(component.cssClass).toContain('animate-pulse');
    });

    it('"stale" → slate', () => {
      component.value = 'stale';
      expect(component.cssClass).toContain('bg-slate-500/15');
    });
  });

  describe('cssClass — job type', () => {
    beforeEach(() => { component.type = 'job'; });

    it('"running" → animate-pulse', () => {
      component.value = 'running';
      expect(component.cssClass).toContain('animate-pulse');
    });

    it('"completed" → emerald', () => {
      component.value = 'completed';
      expect(component.cssClass).toContain('bg-emerald-500/15');
    });

    it('"cancelled" → dark slate', () => {
      component.value = 'cancelled';
      expect(component.cssClass).toContain('bg-slate-600/15');
    });
  });

  describe('cssClass — company type', () => {
    beforeEach(() => { component.type = 'company'; });

    it('"startup" → violet', () => {
      component.value = 'startup';
      expect(component.cssClass).toContain('bg-violet-500/15');
    });

    it('"enterprise" → emerald', () => {
      component.value = 'enterprise';
      expect(component.cssClass).toContain('bg-emerald-500/15');
    });
  });

  it('returns fallback class for unknown value', () => {
    component.type = 'lead';
    component.value = 'unknown-status';
    expect(component.cssClass).toBe('bg-slate-700 text-slate-400 border-slate-600');
  });
});
