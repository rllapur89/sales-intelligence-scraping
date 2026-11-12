import {
  byIndustryFromLeads,
  bySourceFromLeads,
  funnelFromLeads,
  scoreTrendFromLeads,
  signalMixFromLeads,
} from './mock-analytics';
import { makeLead } from '../../../testing/factories';

describe('mock analytics', () => {
  const leads = [
    makeLead({
      id: 'a',
      stage: 'new',
      score: 60,
      signalTypes: ['hiring', 'funding'],
      company: { industry: 'Tech' },
    }),
    makeLead({
      id: 'b',
      stage: 'qualified',
      score: 80,
      signalTypes: ['hiring'],
      company: { industry: 'Tech' },
    }),
    makeLead({
      id: 'c',
      stage: 'won',
      score: 100,
      signalTypes: ['filing'],
      company: { industry: null },
    }),
    makeLead({
      id: 'd',
      stage: 'lost',
      score: 40,
      signalTypes: ['oss-activity'],
      company: { industry: 'Legal' },
    }),
  ];

  it('funnel is cumulative and counts lost leads in the first stage', () => {
    expect(funnelFromLeads(leads).stages.map((s) => s.count)).toEqual([4, 2, 2, 1, 1]);
  });

  it('funnel of no leads is five empty stages', () => {
    expect(funnelFromLeads([]).stages.map((s) => s.count)).toEqual([0, 0, 0, 0, 0]);
  });

  it('by industry averages scores and names the missing industry "unknown"', () => {
    expect(byIndustryFromLeads(leads).items).toEqual([
      { key: 'Tech', label: 'Tech', count: 2, avgScore: 70 },
      { key: 'Legal', label: 'Legal', count: 1, avgScore: 40 },
      { key: 'unknown', label: 'Unknown', count: 1, avgScore: 100 },
    ]);
  });

  it('by source maps signal types to their usual source, once per lead', () => {
    const out = bySourceFromLeads([
      ...leads,
      makeLead({ id: 'e', score: 20, signalTypes: ['hiring', 'hiring'] }),
    ]);
    expect(out.items).toEqual([
      { key: 'greenhouse', label: 'Greenhouse', count: 3, avgScore: 53.3 },
      { key: 'github', label: 'GitHub', count: 1, avgScore: 40 },
      { key: 'hn-hiring', label: 'HN Hiring', count: 1, avgScore: 60 },
      { key: 'sec-edgar', label: 'SEC EDGAR', count: 1, avgScore: 100 },
    ]);
  });

  it('signal mix counts each type per lead and zero-fills', () => {
    const mix = signalMixFromLeads(leads);
    expect(mix.items.find((i) => i.type === 'hiring')?.count).toBe(2);
    expect(mix.items.find((i) => i.type === 'website-tech')?.count).toBe(0);
    expect(mix.items).toHaveLength(5);
  });

  describe('score trend', () => {
    const now = new Date('2025-03-10T12:00:00.000Z');

    it('buckets leads by UTC day of updatedAt and zero-fills the window', () => {
      const trend = scoreTrendFromLeads(
        [
          makeLead({ id: 'a', score: 50, updatedAt: '2025-03-10T01:00:00.000Z' }),
          makeLead({ id: 'b', score: 70, updatedAt: '2025-03-10T09:00:00.000Z' }),
          makeLead({ id: 'c', score: 90, updatedAt: '2025-03-08T23:59:59.000Z' }),
        ],
        3,
        now,
      );
      expect(trend.points).toEqual([
        { date: '2025-03-08', newLeads: 1, avgScore: 90 },
        { date: '2025-03-09', newLeads: 0, avgScore: 0 },
        { date: '2025-03-10', newLeads: 2, avgScore: 60 },
      ]);
    });

    it('ignores leads outside the window, in the future or with a bad date', () => {
      const trend = scoreTrendFromLeads(
        [
          makeLead({ id: 'old', updatedAt: '2025-03-01T00:00:00.000Z' }),
          makeLead({ id: 'future', updatedAt: '2025-03-11T00:00:00.000Z' }),
          makeLead({ id: 'bad', updatedAt: 'nope' }),
        ],
        7,
        now,
      );
      expect(trend.points).toHaveLength(7);
      expect(trend.points.every((p) => p.newLeads === 0)).toBe(true);
    });
  });
});
