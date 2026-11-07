import { Lead } from '../models/lead.model';

/** RFC 4180 field escaping; also neutralises spreadsheet formula injection (=, +, -, @). */
export function csvField(value: string | number | null | undefined): string {
  if (value === null || value === undefined) return '';
  let text = String(value);
  if (/^[=+\-@]/.test(text) && typeof value === 'string') text = `'${text}`;
  return /[",\r\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

export const LEAD_CSV_HEADER = [
  'Company',
  'Domain',
  'Industry',
  'Region',
  'Size',
  'Signals',
  'Signal Count',
  'Score',
  'Stage',
  'Updated',
];

/** One line per lead (company-centric: no personal data). Pure. */
export function leadsToCsv(leads: readonly Lead[]): string {
  const rows = leads.map(l =>
    [
      l.company.name,
      l.company.domain,
      l.company.industry,
      l.company.region,
      l.company.size,
      l.signalTypes.join('|'),
      l.signalCount,
      l.score,
      l.stage,
      l.updatedAt,
    ]
      .map(csvField)
      .join(',')
  );
  return [LEAD_CSV_HEADER.join(','), ...rows].join('\n');
}

export function downloadCsv(filename: string, csv: string): void {
  const blob = new Blob([csv], { type: 'text/csv' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
