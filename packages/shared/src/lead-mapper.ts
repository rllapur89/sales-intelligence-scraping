import type { CompanyDto, CompanySize, LeadDto, PipelineStage, SignalType } from './domain';

/**
 * Database rows to DTOs, shared by the API and the workers so both emit exactly the same lead.
 *
 * The rows are described structurally (enums as strings, `seq` as bigint) so this package does not
 * depend on Prisma. Prisma enums are `UPPER_SNAKE_CASE`; DTO values are `lower-kebab-case`.
 */
export interface DbCompanyRow {
  id: string;
  domain: string;
  name: string;
  industry: string | null;
  region: string | null;
  size: string | null;
  description: string | null;
  techHints: string[];
}

export interface DbLeadRow {
  id: string;
  score: number;
  stage: string;
  signalTypes: string[];
  signalCount: number;
  seq: bigint;
  updatedAt: Date;
}

/** `OSS_ACTIVITY` -> `oss-activity`, `MID_MARKET` -> `mid-market`. */
export function fromDbEnum(value: string): string {
  return value.toLowerCase().replace(/_/g, '-');
}

export const fromDbSignalType = (t: string): SignalType => fromDbEnum(t) as SignalType;
export const fromDbStage = (s: string): PipelineStage => fromDbEnum(s) as PipelineStage;
export const fromDbSize = (s: string): CompanySize => fromDbEnum(s) as CompanySize;

export function toCompanyDto(company: DbCompanyRow): CompanyDto {
  return {
    id: company.id,
    domain: company.domain,
    name: company.name,
    industry: company.industry,
    region: company.region,
    size: company.size === null ? null : fromDbSize(company.size),
    description: company.description,
    techHints: company.techHints,
  };
}

export function toLeadDto(lead: DbLeadRow, company: DbCompanyRow): LeadDto {
  return {
    id: lead.id,
    company: toCompanyDto(company),
    score: lead.score,
    stage: fromDbStage(lead.stage),
    signalTypes: lead.signalTypes.map(fromDbSignalType),
    signalCount: lead.signalCount,
    seq: Number(lead.seq),
    updatedAt: lead.updatedAt.toISOString(),
  };
}
