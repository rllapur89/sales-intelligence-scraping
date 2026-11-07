import type { CompanySize, LeadDto, PipelineStage, SignalType } from '@leads/shared';

/** The client works with companies that show buying signals; no personal data is modelled. */
export type Lead = LeadDto;
export type LeadStatus = PipelineStage;
export type { CompanySize, PipelineStage, SignalType };

export interface LeadFilter {
  search: string;
  industries: string[];
  regions: string[];
  companySizes: CompanySize[];
  stages: PipelineStage[];
  scoreMin: number;
  scoreMax: number;
}

export const DEFAULT_FILTER: LeadFilter = {
  search: '',
  industries: [],
  regions: [],
  companySizes: [],
  stages: [],
  scoreMin: 0,
  scoreMax: 100,
};

export interface BulkSelection {
  mode: 'include' | 'exclude';
  ids: Set<string>;
  totalCount: number;
}

export function getSelectedCount(sel: BulkSelection): number {
  if (sel.mode === 'include') return sel.ids.size;
  return sel.totalCount - sel.ids.size;
}

export function isSelected(sel: BulkSelection, id: string): boolean {
  if (sel.mode === 'include') return sel.ids.has(id);
  return !sel.ids.has(id);
}
