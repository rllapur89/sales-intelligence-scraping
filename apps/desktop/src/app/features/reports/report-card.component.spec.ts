import { TestBed } from '@angular/core/testing';
import { ReportCardComponent } from './report-card.component';
import type { ReportTable } from '../../core/analytics/report-tables';

const table: ReportTable = {
  id: 'signals',
  title: 'Signal mix',
  columns: ['Signal type', 'Signals'],
  rows: [
    ['hiring', 3],
    ['funding', 1],
  ],
};

function setup(inputs: Record<string, unknown>) {
  TestBed.configureTestingModule({ imports: [ReportCardComponent] });
  const fixture = TestBed.createComponent(ReportCardComponent);
  fixture.componentRef.setInput('title', 'Signal mix');
  for (const [key, value] of Object.entries(inputs)) fixture.componentRef.setInput(key, value);
  return fixture;
}

const buttons = (el: HTMLElement) => Array.from(el.querySelectorAll('button'));

describe('ReportCardComponent', () => {
  it('shows a busy status and disables export while loading', async () => {
    const fixture = setup({ status: 'loading' });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('section')?.getAttribute('aria-busy')).toBe('true');
    expect(el.querySelector('[role="status"]')?.textContent).toContain('Loading');
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
  });

  it('shows an alert with the message and emits retry', async () => {
    const fixture = setup({ status: 'error', errorMessage: 'Cannot reach the server.' });
    let retried = 0;
    fixture.componentInstance.retry.subscribe(() => retried++);
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('[role="alert"]')?.textContent).toContain('Cannot reach the server.');
    buttons(el)
      .find((b) => b.textContent?.trim() === 'Retry')!
      .click();
    expect(retried).toBe(1);
    const exports = buttons(el).filter((b) => b.textContent?.trim() !== 'Retry');
    expect(exports.every((b) => b.disabled)).toBe(true);
  });

  it('shows the empty message instead of the chart and disables export', async () => {
    const fixture = setup({ status: 'ready', empty: true, table });
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.textContent).toContain('No data yet');
    expect(el.querySelector('table')).toBeNull();
    expect(buttons(el).every((b) => b.disabled)).toBe(true);
  });

  it('renders the table fallback and emits the export events when ready', async () => {
    const fixture = setup({ status: 'ready', table });
    const events: string[] = [];
    fixture.componentInstance.exportCsv.subscribe(() => events.push('csv'));
    fixture.componentInstance.exportJson.subscribe(() => events.push('json'));
    await fixture.whenStable();
    const el: HTMLElement = fixture.nativeElement;
    expect(el.querySelector('summary')?.textContent).toContain('View as table');
    expect(Array.from(el.querySelectorAll('th')).map((th) => th.textContent?.trim())).toEqual([
      'Signal type',
      'Signals',
    ]);
    expect(el.querySelectorAll('tbody tr')).toHaveLength(2);
    expect(el.querySelectorAll('tbody tr')[0].textContent).toContain('hiring');
    el.querySelector<HTMLButtonElement>('button[aria-label="Export Signal mix as CSV"]')!.click();
    el.querySelector<HTMLButtonElement>('button[aria-label="Export Signal mix as JSON"]')!.click();
    expect(events).toEqual(['csv', 'json']);
  });
});
