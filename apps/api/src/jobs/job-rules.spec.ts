import 'reflect-metadata';
import { BadRequestException, ConflictException } from '@nestjs/common';
import { plainToInstance } from 'class-transformer';
import { validateSync } from 'class-validator';
import { JOB_STATUSES, SOURCE_KEYS, SOURCE_POLICIES } from '@leads/shared';
import { describe, expect, it } from 'vitest';
import {
  assertCancellable,
  assertRetryable,
  assertSourceReviewed,
  buildPlanJobOptions,
  buildPlanTaskData,
  canCancel,
  canRetry,
  slugsFromParams,
} from './job-rules';
import { CreateJobDto } from './jobs.dto';

describe('state transitions', () => {
  it('cancels only queued/running', () => {
    expect(JOB_STATUSES.filter(canCancel)).toEqual(['queued', 'running']);
    expect(() => assertCancellable('queued')).not.toThrow();
    expect(() => assertCancellable('completed')).toThrow(ConflictException);
    expect(() => assertCancellable('cancelled')).toThrow(ConflictException);
  });

  it('retries only failed/cancelled', () => {
    expect(JOB_STATUSES.filter(canRetry)).toEqual(['failed', 'cancelled']);
    expect(() => assertRetryable('failed')).not.toThrow();
    expect(() => assertRetryable('running')).toThrow(ConflictException);
  });
});

describe('source policy', () => {
  it('rejects unreviewed sources with 400 and accepts reviewed ones', () => {
    expect(() => assertSourceReviewed('greenhouse')).not.toThrow();
    expect(() => assertSourceReviewed('lever')).not.toThrow();
    expect(() => assertSourceReviewed('hn-hiring')).toThrow(BadRequestException);
  });

  it('follows SOURCE_POLICIES for every source (new reviewed sources are accepted)', () => {
    for (const source of SOURCE_KEYS) {
      if (SOURCE_POLICIES[source].reviewed) {
        expect(() => assertSourceReviewed(source)).not.toThrow();
      } else {
        expect(() => assertSourceReviewed(source)).toThrow(BadRequestException);
      }
    }
    for (const source of ['remoteok', 'github', 'sec-edgar', 'website'] as const) {
      expect(() => assertSourceReviewed(source)).not.toThrow();
    }
  });

  it('builds plan data and job options from the policy', () => {
    expect(buildPlanTaskData('j1', 'lever')).toEqual({
      kind: 'plan',
      scrapingJobId: 'j1',
      source: 'lever',
    });
    expect(buildPlanTaskData('j1', 'lever', ['a'])).toEqual({
      kind: 'plan',
      scrapingJobId: 'j1',
      source: 'lever',
      slugs: ['a'],
    });
    expect(buildPlanTaskData('j1', 'lever', [])).not.toHaveProperty('slugs');
    expect(buildPlanJobOptions('greenhouse', 'j1')).toEqual({
      jobId: 'plan-j1',
      attempts: SOURCE_POLICIES.greenhouse.attempts,
      backoff: { type: 'custom' },
    });
  });

  it('reads slugs back from params', () => {
    expect(slugsFromParams({ slugs: ['a', 'b'] })).toEqual(['a', 'b']);
    expect(slugsFromParams({})).toBeUndefined();
    expect(slugsFromParams(null)).toBeUndefined();
    expect(slugsFromParams({ slugs: [] })).toBeUndefined();
  });
});

describe('CreateJobDto', () => {
  const errors = (plain: Record<string, unknown>): number =>
    validateSync(plainToInstance(CreateJobDto, plain), {
      whitelist: true,
      forbidNonWhitelisted: true,
    }).length;

  it('accepts every known source with optional slugs', () => {
    for (const source of SOURCE_KEYS) expect(errors({ source })).toBe(0);
    expect(errors({ source: 'lever', slugs: ['acme', 'foo-bar'] })).toBe(0);
  });

  it.each([
    ['unknown source', { source: 'linkedin' }],
    ['missing source', {}],
    ['slugs not array', { source: 'lever', slugs: 'acme' }],
    ['bad slug chars', { source: 'lever', slugs: ['a b/../x'] }],
    ['extra field', { source: 'lever', foo: 1 }],
  ])('rejects %s', (_n, plain) => {
    expect(errors(plain)).toBeGreaterThan(0);
  });
});
