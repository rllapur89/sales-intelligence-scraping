import type { LeadDto, LeadUpsertedEvent, SignalType } from '@leads/shared';

export function makeLead(
  id: string,
  over: Partial<LeadDto> & { industry?: string | null; region?: string | null } = {},
): LeadDto {
  const { industry = 'SaaS', region = 'US', ...rest } = over;
  return {
    id,
    company: {
      id: `c-${id}`,
      domain: `${id}.example.com`,
      name: `Company ${id}`,
      industry,
      region,
      size: null,
      description: null,
      techHints: [],
    },
    score: 50,
    stage: 'new',
    signalTypes: ['hiring'] satisfies SignalType[],
    signalCount: 1,
    seq: 1,
    updatedAt: new Date(0).toISOString(),
    ...rest,
  };
}

export function makeEvent(seq: number, lead: LeadDto): LeadUpsertedEvent {
  return {
    type: 'lead.upserted',
    seq,
    source: 'greenhouse',
    lead: { ...lead, seq },
    timings: { scrapedAt: 1000, ingestedAt: 2000 },
  };
}
