export type LeadStatus = 'new' | 'contacted' | 'qualified' | 'proposal' | 'won' | 'lost';
export type ScrapingStatus = 'stale' | 'validating' | 'updated' | 'failed';
export type CompanySize = 'startup' | 'smb' | 'mid-market' | 'enterprise';

export interface Lead {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phone?: string;
  company: string;
  companySize: CompanySize;
  industry: string;
  country: string;
  city: string;
  role: string;
  seniority: 'c-level' | 'vp' | 'director' | 'manager' | 'individual';
  linkedinUrl?: string;
  websiteUrl?: string;
  score: number;
  status: LeadStatus;
  scrapingStatus: ScrapingStatus;
  estimatedValue: number;
  lastScraped: Date;
  createdAt: Date;
  tags: string[];
  assignedTo?: string;
  notes?: string;
  techStack?: string[];
}

export interface LeadFilter {
  search: string;
  industries: string[];
  countries: string[];
  companySizes: CompanySize[];
  statuses: LeadStatus[];
  scoreMin: number;
  scoreMax: number;
  assignedTo: string;
}

export const DEFAULT_FILTER: LeadFilter = {
  search: '',
  industries: [],
  countries: [],
  companySizes: [],
  statuses: [],
  scoreMin: 0,
  scoreMax: 100,
  assignedTo: '',
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
