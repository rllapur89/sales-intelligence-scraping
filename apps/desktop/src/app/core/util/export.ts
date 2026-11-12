import type { ReportTable } from '../analytics/report-tables';
import { csvField } from './csv';

/** CSV of a report table. Reuses `csvField`, so text cells are escaped and formula-safe. Pure. */
export function reportToCsv(table: ReportTable): string {
  const lines = [table.columns, ...table.rows].map((row) => row.map(csvField).join(','));
  return lines.join('\n');
}

/** JSON of a report table: an array of objects keyed by column name, with the report metadata. Pure. */
export function reportToJson(table: ReportTable, generatedAt: Date, days?: number): string {
  const rows = table.rows.map((row) =>
    Object.fromEntries(table.columns.map((column, index) => [column, row[index] ?? null])),
  );
  return JSON.stringify(
    { report: table.id, title: table.title, generatedAt: generatedAt.toISOString(), days, rows },
    null,
    2,
  );
}

export type ExportFormat = 'csv' | 'json';

/** `salesintel-<report>-<YYYY-MM-DD>.<ext>` (UTC date). Pure. */
export function exportFilename(table: ReportTable, format: ExportFormat, now: Date): string {
  return `salesintel-${table.id}-${now.toISOString().slice(0, 10)}.${format}`;
}

const MIME: Record<ExportFormat, string> = { csv: 'text/csv', json: 'application/json' };

export function downloadText(filename: string, text: string, format: ExportFormat): void {
  const blob = new Blob([text], { type: MIME[format] });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
