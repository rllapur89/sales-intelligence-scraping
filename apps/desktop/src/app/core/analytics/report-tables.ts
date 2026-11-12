import type { BreakdownDto, FunnelDto, ScoreTrendDto, SignalMixDto } from '@leads/shared';

export type ReportId = 'funnel' | 'by-source' | 'by-industry' | 'signals' | 'score-trend';

export type TableCell = string | number;

/** A report as plain rows: the visible table fallback of every chart and the input of the export. */
export interface ReportTable {
  id: ReportId;
  title: string;
  columns: string[];
  rows: TableCell[][];
}

export function funnelTable(dto: FunnelDto): ReportTable {
  return {
    id: 'funnel',
    title: 'Pipeline funnel',
    columns: ['Stage', 'Leads', 'Conversion from previous (%)'],
    rows: dto.stages.map((s) => [s.stage, s.count, s.conversionFromPrevious]),
  };
}

export function breakdownTable(id: 'by-source' | 'by-industry', dto: BreakdownDto): ReportTable {
  const isSource = id === 'by-source';
  return {
    id,
    title: isSource ? 'Leads by source' : 'Leads by industry',
    columns: [isSource ? 'Source' : 'Industry', 'Leads', 'Average score'],
    rows: dto.items.map((i) => [i.label, i.count, i.avgScore]),
  };
}

export function signalsTable(dto: SignalMixDto): ReportTable {
  return {
    id: 'signals',
    title: 'Signal mix',
    columns: ['Signal type', 'Signals'],
    rows: dto.items.map((i) => [i.type, i.count]),
  };
}

export function scoreTrendTable(dto: ScoreTrendDto): ReportTable {
  return {
    id: 'score-trend',
    title: `Score trend (last ${dto.days} days)`,
    columns: ['Date', 'New leads', 'Average score'],
    rows: dto.points.map((p) => [p.date, p.newLeads, p.avgScore]),
  };
}

/** Short summary read by screen readers in place of the picture of a chart. */
export function describeTable(table: ReportTable): string {
  if (table.rows.length === 0) return `${table.title}: no data`;
  const preview = table.rows
    .slice(0, 5)
    .map((row) => `${row[0]} ${row[1]}`)
    .join(', ');
  const more = table.rows.length > 5 ? `, and ${table.rows.length - 5} more` : '';
  return `${table.title}: ${preview}${more}`;
}
