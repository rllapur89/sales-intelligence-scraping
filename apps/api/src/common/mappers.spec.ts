import { PIPELINE_STAGES, SIGNAL_TYPES, JOB_STATUSES } from '@leads/shared';
import { describe, expect, it } from 'vitest';
import {
  fromDbJobStatus,
  fromDbSignalType,
  fromDbSize,
  fromDbStage,
  toDbJobStatus,
  toDbSignalType,
  toDbSize,
  toDbStage,
  toErrorList,
} from './mappers';

describe('enum mappers', () => {
  it('maps stages to UPPERCASE and back', () => {
    expect(toDbStage('qualified')).toBe('QUALIFIED');
    for (const s of PIPELINE_STAGES) expect(fromDbStage(toDbStage(s))).toBe(s);
  });

  it('maps signal types with dashes to underscores', () => {
    expect(toDbSignalType('oss-activity')).toBe('OSS_ACTIVITY');
    expect(toDbSignalType('website-tech')).toBe('WEBSITE_TECH');
    for (const s of SIGNAL_TYPES) expect(fromDbSignalType(toDbSignalType(s))).toBe(s);
  });

  it('maps job statuses', () => {
    expect(toDbJobStatus('cancelled')).toBe('CANCELLED');
    for (const s of JOB_STATUSES) expect(fromDbJobStatus(toDbJobStatus(s))).toBe(s);
  });

  it('maps company sizes', () => {
    expect(toDbSize('mid-market')).toBe('MID_MARKET');
    expect(fromDbSize('ENTERPRISE')).toBe('enterprise');
  });

  it('keeps only string errors', () => {
    expect(toErrorList(['a', 1, null, 'b'])).toEqual(['a', 'b']);
    expect(toErrorList({})).toEqual([]);
  });
});
