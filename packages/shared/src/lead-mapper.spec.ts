import { describe, expect, it } from 'vitest';
import { PIPELINE_STAGES, SIGNAL_TYPES } from './domain';
import {
  fromDbEnum,
  fromDbSignalType,
  fromDbSize,
  fromDbStage,
  toCompanyDto,
  toLeadDto,
  type DbCompanyRow,
  type DbLeadRow,
} from './lead-mapper';

const company: DbCompanyRow = {
  id: 'c1',
  domain: 'acme.com',
  name: 'Acme',
  industry: 'SaaS',
  region: 'US',
  size: 'MID_MARKET',
  description: null,
  techHints: ['react'],
};

const lead: DbLeadRow = {
  id: 'l1',
  score: 72,
  stage: 'QUALIFIED',
  signalTypes: ['HIRING', 'OSS_ACTIVITY'],
  signalCount: 5,
  seq: 123n,
  updatedAt: new Date('2026-01-02T03:04:05.000Z'),
};

describe('enum conversion', () => {
  it('lowercases and turns underscores into dashes', () => {
    expect(fromDbEnum('OSS_ACTIVITY')).toBe('oss-activity');
    expect(fromDbEnum('NEW')).toBe('new');
  });

  it('round-trips every DTO signal type and pipeline stage from its DB spelling', () => {
    for (const t of SIGNAL_TYPES) {
      expect(fromDbSignalType(t.toUpperCase().replace(/-/g, '_'))).toBe(t);
    }
    for (const s of PIPELINE_STAGES) expect(fromDbStage(s.toUpperCase())).toBe(s);
  });

  it('maps company sizes', () => {
    expect(fromDbSize('STARTUP')).toBe('startup');
    expect(fromDbSize('MID_MARKET')).toBe('mid-market');
  });
});

describe('toCompanyDto', () => {
  it('copies the fields and converts the size', () => {
    expect(toCompanyDto(company)).toEqual({ ...company, size: 'mid-market' });
  });

  it('keeps a null size', () => {
    expect(toCompanyDto({ ...company, size: null }).size).toBeNull();
  });
});

describe('toLeadDto', () => {
  it('builds the DTO with a numeric seq and an ISO date', () => {
    expect(toLeadDto(lead, company)).toEqual({
      id: 'l1',
      company: { ...company, size: 'mid-market' },
      score: 72,
      stage: 'qualified',
      signalTypes: ['hiring', 'oss-activity'],
      signalCount: 5,
      seq: 123,
      updatedAt: '2026-01-02T03:04:05.000Z',
    });
  });

  it('omits assigneeId when the row has none (backward compatible shape)', () => {
    expect('assigneeId' in toLeadDto(lead, company)).toBe(false);
  });

  it('carries the assignee, including null for unassigned leads', () => {
    expect(toLeadDto({ ...lead, assigneeId: 'u1' }, company).assigneeId).toBe('u1');
    expect(toLeadDto({ ...lead, assigneeId: null }, company).assigneeId).toBeNull();
  });
});
