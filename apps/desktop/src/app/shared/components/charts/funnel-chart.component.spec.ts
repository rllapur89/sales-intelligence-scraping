import { TestBed } from '@angular/core/testing';
import { FunnelChartComponent, FunnelStep } from './funnel-chart.component';

async function render(steps: FunnelStep[]) {
  TestBed.configureTestingModule({ imports: [FunnelChartComponent] });
  const fixture = TestBed.createComponent(FunnelChartComponent);
  fixture.componentRef.setInput('steps', steps);
  fixture.componentRef.setInput('ariaLabel', 'Pipeline funnel');
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('FunnelChartComponent', () => {
  it('renders an ordered list with count and conversion per step', async () => {
    const el = await render([
      { label: 'new', count: 100, conversion: null },
      { label: 'contacted', count: 40, conversion: 40 },
      { label: 'won', count: 0, conversion: 0 },
    ]);
    expect(el.querySelector('ol')?.getAttribute('aria-label')).toBe('Pipeline funnel');
    const items = el.querySelectorAll('li');
    expect(items).toHaveLength(3);
    expect(items[0].textContent).toContain('100');
    expect(items[0].textContent).not.toContain('of prev.');
    expect(items[1].textContent).toContain('40% of prev.');
    const widths = Array.from(
      el.querySelectorAll<HTMLElement>('li span[aria-hidden="true"] > span'),
    ).map((b) => b.style.width);
    expect(widths).toEqual(['100%', '40%', '0%']);
  });

  it('renders nothing for no steps', async () => {
    expect((await render([])).querySelectorAll('li')).toHaveLength(0);
  });

  it('renders all-zero steps with empty bars', async () => {
    const el = await render([
      { label: 'new', count: 0, conversion: null },
      { label: 'won', count: 0, conversion: 0 },
    ]);
    const widths = Array.from(
      el.querySelectorAll<HTMLElement>('li span[aria-hidden="true"] > span'),
    ).map((b) => b.style.width);
    expect(widths).toEqual(['0%', '0%']);
  });
});
