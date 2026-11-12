import { describe, expect, it } from 'vitest';
import {
  industryRowsFromGroups,
  signalCountsFromGroups,
  stageCountsFromGroups,
  trendRowsFromRaw,
} from './analytics-rows';

describe('stageCountsFromGroups', () => {
  it('converts DB enums to DTO stages', () => {
    expect(
      stageCountsFromGroups([
        { stage: 'NEW', _count: { _all: 5 } },
        { stage: 'QUALIFIED', _count: { _all: 2 } },
        { stage: 'LOST', _count: { _all: 1 } },
      ]),
    ).toEqual({ new: 5, qualified: 2, lost: 1 });
  });

  it('is empty for no rows', () => {
    expect(stageCountsFromGroups([])).toEqual({});
  });
});

describe('signalCountsFromGroups', () => {
  it('converts UPPER_SNAKE types to lower-kebab', () => {
    expect(
      signalCountsFromGroups([
        { type: 'OSS_ACTIVITY', _count: { _all: 3 } },
        { type: 'WEBSITE_TECH', _count: { _all: 1 } },
      ]),
    ).toEqual({ 'oss-activity': 3, 'website-tech': 1 });
  });
});

describe('industryRowsFromGroups', () => {
  it('keeps the null industry so the breakdown can name it "unknown"', () => {
    expect(
      industryRowsFromGroups([
        { industry: 'Finance', _count: { _all: 4 }, _avg: { score: 71.5 } },
        { industry: null, _count: { _all: 2 }, _avg: { score: null } },
      ]),
    ).toEqual([
      { key: 'Finance', count: 4, avgScore: 71.5 },
      { key: null, count: 2, avgScore: null },
    ]);
  });
});

describe('trendRowsFromRaw', () => {
  it('converts bigint counts and numeric strings', () => {
    expect(
      trendRowsFromRaw([
        { day: '2025-03-09', count: 3n, avg: '64.5000' },
        { day: '2025-03-10', count: 1, avg: null },
        { day: '2025-03-11', count: 2, avg: 'oops' },
      ]),
    ).toEqual([
      { date: '2025-03-09', newLeads: 3, avgScore: 64.5 },
      { date: '2025-03-10', newLeads: 1, avgScore: null },
      { date: '2025-03-11', newLeads: 2, avgScore: null },
    ]);
  });
});
