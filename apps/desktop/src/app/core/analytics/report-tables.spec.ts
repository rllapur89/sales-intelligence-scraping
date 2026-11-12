import {
  breakdownTable,
  describeTable,
  funnelTable,
  scoreTrendTable,
  signalsTable,
} from './report-tables';

describe('report tables', () => {
  it('funnel rows carry stage, count and conversion', () => {
    const t = funnelTable({
      stages: [
        { stage: 'new', count: 10, conversionFromPrevious: 100 },
        { stage: 'contacted', count: 4, conversionFromPrevious: 40 },
      ],
    });
    expect(t.id).toBe('funnel');
    expect(t.columns).toHaveLength(3);
    expect(t.rows).toEqual([
      ['new', 10, 100],
      ['contacted', 4, 40],
    ]);
  });

  it('breakdown tables use the label and name the first column after the report', () => {
    const dto = { items: [{ key: 'github', label: 'GitHub', count: 3, avgScore: 71.5 }] };
    const source = breakdownTable('by-source', dto);
    const industry = breakdownTable('by-industry', dto);
    expect(source.columns[0]).toBe('Source');
    expect(industry.columns[0]).toBe('Industry');
    expect(source.rows).toEqual([['GitHub', 3, 71.5]]);
    expect(industry.id).toBe('by-industry');
  });

  it('signals and score trend rows keep the order of the DTO', () => {
    expect(signalsTable({ items: [{ type: 'hiring', count: 2 }] }).rows).toEqual([['hiring', 2]]);
    const trend = scoreTrendTable({
      days: 2,
      points: [
        { date: '2025-03-09', newLeads: 0, avgScore: 0 },
        { date: '2025-03-10', newLeads: 3, avgScore: 70 },
      ],
    });
    expect(trend.title).toBe('Score trend (last 2 days)');
    expect(trend.rows[1]).toEqual(['2025-03-10', 3, 70]);
  });

  it('describes a table for assistive technology, truncating long ones', () => {
    const rows = Array.from({ length: 7 }, (_, i) => [`k${i}`, i]);
    const text = describeTable({ id: 'signals', title: 'Signal mix', columns: ['a', 'b'], rows });
    expect(text).toBe('Signal mix: k0 0, k1 1, k2 2, k3 3, k4 4, and 2 more');
    expect(describeTable({ id: 'signals', title: 'Signal mix', columns: [], rows: [] })).toBe(
      'Signal mix: no data',
    );
  });
});
