import { exportFilename, reportToCsv, reportToJson } from './export';
import type { ReportTable } from '../analytics/report-tables';

const table: ReportTable = {
  id: 'by-industry',
  title: 'Leads by industry',
  columns: ['Industry', 'Leads', 'Average score'],
  rows: [
    ['Tech, Inc', 3, 71.5],
    ['Legal', 1, 40],
  ],
};

describe('report export', () => {
  it('writes a CSV header and one escaped line per row', () => {
    expect(reportToCsv(table)).toBe('Industry,Leads,Average score\n"Tech, Inc",3,71.5\nLegal,1,40');
  });

  it('neutralises spreadsheet formulas in text cells but keeps numbers intact', () => {
    const csv = reportToCsv({ ...table, rows: [['=HYPERLINK("x")', -2, 1]] });
    expect(csv.split('\n')[1]).toBe(`"'=HYPERLINK(""x"")",-2,1`);
  });

  it('exports only the header for an empty report', () => {
    expect(reportToCsv({ ...table, rows: [] })).toBe('Industry,Leads,Average score');
  });

  it('writes JSON rows keyed by column with the report metadata', () => {
    const json = JSON.parse(reportToJson(table, new Date('2025-03-10T12:00:00.000Z'), 30));
    expect(json).toEqual({
      report: 'by-industry',
      title: 'Leads by industry',
      generatedAt: '2025-03-10T12:00:00.000Z',
      days: 30,
      rows: [
        { Industry: 'Tech, Inc', Leads: 3, 'Average score': 71.5 },
        { Industry: 'Legal', Leads: 1, 'Average score': 40 },
      ],
    });
  });

  it('omits days when the report has no range and uses an empty rows array for no data', () => {
    const json = JSON.parse(reportToJson({ ...table, rows: [] }, new Date(0)));
    expect(json.days).toBeUndefined();
    expect(json.rows).toEqual([]);
  });

  it('names files after the report, the UTC date and the format', () => {
    const now = new Date('2025-03-10T23:30:00.000Z');
    expect(exportFilename(table, 'csv', now)).toBe('salesintel-by-industry-2025-03-10.csv');
    expect(exportFilename(table, 'json', now)).toBe('salesintel-by-industry-2025-03-10.json');
  });
});
