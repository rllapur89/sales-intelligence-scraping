import { TestBed } from '@angular/core/testing';
import { LineChartComponent } from './line-chart.component';

async function render(values: number[], ariaLabel = 'Trend') {
  const fixture = TestBed.createComponent(LineChartComponent);
  fixture.componentRef.setInput(
    'data',
    values.map((value, i) => ({ label: `d${i}`, value })),
  );
  fixture.componentRef.setInput('ariaLabel', ariaLabel);
  await fixture.whenStable();
  return fixture.nativeElement as HTMLElement;
}

describe('LineChartComponent', () => {
  beforeEach(() => TestBed.configureTestingModule({ imports: [LineChartComponent] }));

  it('draws a line, an area and one titled marker per point', async () => {
    const el = await render([1, 3, 2], 'Average score');
    const svg = el.querySelector('svg')!;
    expect(svg.getAttribute('role')).toBe('img');
    expect(svg.getAttribute('aria-label')).toBe('Average score');
    const paths = el.querySelectorAll('path');
    expect(paths).toHaveLength(2);
    expect(paths[1].getAttribute('d')).toMatch(/^M 0 /);
    expect(paths[0].getAttribute('d')).toMatch(/Z$/);
    const circles = el.querySelectorAll('circle');
    expect(circles).toHaveLength(3);
    expect(circles[1].querySelector('title')?.textContent).toBe('d1: 3');
  });

  it('draws no path for empty data', async () => {
    const el = await render([]);
    const paths = el.querySelectorAll('path');
    expect(paths[0].getAttribute('d')).toBe('');
    expect(paths[1].getAttribute('d')).toBe('');
    expect(el.querySelectorAll('circle')).toHaveLength(0);
  });

  it('drops the point markers on long ranges and thins the labels', async () => {
    const el = await render(Array.from({ length: 90 }, (_, i) => i % 7));
    expect(el.querySelectorAll('circle')).toHaveLength(0);
    const labels = el.querySelectorAll('div > span');
    expect(labels.length).toBeLessThanOrEqual(5);
    expect(labels[labels.length - 1].textContent).toBe('d89');
  });

  it('keeps an all-zero series on the baseline', async () => {
    const el = await render([0, 0, 0]);
    const ys = Array.from(el.querySelectorAll('circle')).map((c) => c.getAttribute('cy'));
    expect(ys).toEqual(['100', '100', '100']);
  });

  it('gives each chart instance its own gradient id', async () => {
    const a = await render([1]);
    const b = await render([1]);
    expect(a.querySelector('linearGradient')?.id).not.toBe(b.querySelector('linearGradient')?.id);
  });
});
