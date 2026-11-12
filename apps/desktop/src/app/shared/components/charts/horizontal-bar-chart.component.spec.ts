import { TestBed } from '@angular/core/testing';
import { HorizontalBarChartComponent } from './horizontal-bar-chart.component';

describe('HorizontalBarChartComponent', () => {
  async function render(data: { label: string; value: number; detail?: string }[]) {
    TestBed.configureTestingModule({ imports: [HorizontalBarChartComponent] });
    const fixture = TestBed.createComponent(HorizontalBarChartComponent);
    fixture.componentRef.setInput('data', data);
    fixture.componentRef.setInput('ariaLabel', 'Leads by industry');
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('renders a labelled list with text values and proportional widths', async () => {
    const el = await render([
      { label: 'Tech', value: 10, detail: 'avg 70' },
      { label: 'Legal', value: 5 },
    ]);
    expect(el.querySelector('ul')?.getAttribute('aria-label')).toBe('Leads by industry');
    const items = el.querySelectorAll('li');
    expect(items).toHaveLength(2);
    expect(items[0].textContent).toContain('Tech');
    expect(items[0].textContent).toContain('10');
    expect(items[0].textContent).toContain('avg 70');
    expect(items[1].textContent).not.toContain('avg');
    const bars = el.querySelectorAll<HTMLElement>('li span[aria-hidden="true"] > span');
    expect(bars[0].style.width).toBe('100%');
    expect(bars[1].style.width).toBe('50%');
  });

  it('renders nothing for empty data', async () => {
    const el = await render([]);
    expect(el.querySelectorAll('li')).toHaveLength(0);
  });

  it('keeps zero values at width 0', async () => {
    const el = await render([{ label: 'none', value: 0 }]);
    expect(el.querySelector<HTMLElement>('li span[aria-hidden="true"] > span')?.style.width).toBe(
      '0%',
    );
  });
});
