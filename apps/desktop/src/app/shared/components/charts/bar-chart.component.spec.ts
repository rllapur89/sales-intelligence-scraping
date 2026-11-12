import { TestBed } from '@angular/core/testing';
import { BarChartComponent } from './bar-chart.component';

async function render(data: { label: string; value: number }[], ariaLabel?: string) {
  TestBed.configureTestingModule({ imports: [BarChartComponent] });
  const fixture = TestBed.createComponent(BarChartComponent);
  fixture.componentRef.setInput('data', data);
  if (ariaLabel) fixture.componentRef.setInput('ariaLabel', ariaLabel);
  await fixture.whenStable();
  return fixture;
}

describe('BarChartComponent', () => {
  it('draws one rect per datum with a title and an accessible name', async () => {
    const fixture = await render(
      [
        { label: 'Mon', value: 2 },
        { label: 'Tue', value: 4 },
      ],
      'New leads per day',
    );
    const el: HTMLElement = fixture.nativeElement;
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('New leads per day');
    const rects = el.querySelectorAll('rect');
    expect(rects).toHaveLength(2);
    expect(rects[1].querySelector('title')?.textContent).toBe('Tue: 4');
    expect(Number(rects[1].getAttribute('height'))).toBeGreaterThan(
      Number(rects[0].getAttribute('height')),
    );
  });

  it('thins the x labels', async () => {
    const data = Array.from({ length: 30 }, (_, i) => ({ label: `d${i}`, value: i }));
    const fixture = await render(data);
    const labels = fixture.nativeElement.querySelectorAll('div > span');
    expect(labels.length).toBeLessThanOrEqual(6);
    expect(labels[0].textContent).toBe('d0');
    expect(labels[labels.length - 1].textContent).toBe('d29');
  });

  it('renders no bars for empty data', async () => {
    const fixture = await render([]);
    expect(fixture.nativeElement.querySelectorAll('rect')).toHaveLength(0);
  });

  it('gives zero values a zero-height bar', async () => {
    const fixture = await render([{ label: 'a', value: 0 }]);
    expect(fixture.nativeElement.querySelector('rect').getAttribute('height')).toBe('0');
  });
});
