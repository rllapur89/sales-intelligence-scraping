import { describe, expect, it } from 'vitest';
import type { SignalType } from '@leads/shared';
import { SIGNAL_TYPES } from '@leads/shared';
import { recencyWeight, scoreLead, type ScorableSignal } from './score';

const now = new Date('2026-06-30T00:00:00Z');
const daysAgo = (d: number): Date => new Date(now.getTime() - d * 86_400_000);
const sig = (type: SignalType, d: number, kind?: string): ScorableSignal => ({
  type,
  detectedAt: daysAgo(d),
  kind,
});
const many = (n: number, make: () => ScorableSignal): ScorableSignal[] =>
  Array.from({ length: n }, make);

describe('recencyWeight', () => {
  it('decays by age and dies after 90 days', () => {
    expect(recencyWeight(daysAgo(14), now)).toBe(1);
    expect(recencyWeight(daysAgo(30), now)).toBe(0.5);
    expect(recencyWeight(daysAgo(90), now)).toBe(0.2);
    expect(recencyWeight(daysAgo(91), now)).toBe(0);
  });
});

describe('scoreLead v2', () => {
  it('is 0 without live signals, for every type', () => {
    expect(scoreLead([], now)).toBe(0);
    for (const type of SIGNAL_TYPES) expect(scoreLead([sig(type, 200)], now)).toBe(0);
  });

  it('hiring: log volume with diminishing returns, capped at 100', () => {
    expect(scoreLead([sig('hiring', 1)], now)).toBe(15);
    expect(
      scoreLead(
        many(15, () => sig('hiring', 1)),
        now,
      ),
    ).toBe(60);
    expect(
      scoreLead(
        many(5000, () => sig('hiring', 1)),
        now,
      ),
    ).toBe(100);
  });

  it('filing: 25 within 30 days, 10 within 90, no stacking', () => {
    expect(scoreLead([sig('filing', 5)], now)).toBe(25);
    expect(scoreLead([sig('filing', 30)], now)).toBe(25);
    expect(scoreLead([sig('filing', 31)], now)).toBe(10);
    expect(scoreLead([sig('filing', 90)], now)).toBe(10);
    expect(scoreLead([sig('filing', 91)], now)).toBe(0);
    expect(
      scoreLead(
        many(10, () => sig('filing', 2)),
        now,
      ),
    ).toBe(25);
    expect(scoreLead([sig('filing', 80), sig('filing', 3)], now)).toBe(25);
  });

  it('oss-activity: new repo 8, release 5, recency weighted, capped at 15', () => {
    expect(scoreLead([sig('oss-activity', 1, 'new-repo')], now)).toBe(8);
    expect(scoreLead([sig('oss-activity', 1, 'release')], now)).toBe(5);
    expect(scoreLead([sig('oss-activity', 1)], now)).toBe(5);
    expect(scoreLead([sig('oss-activity', 20, 'new-repo')], now)).toBe(4);
    expect(scoreLead([sig('oss-activity', 60, 'new-repo')], now)).toBe(2);
    expect(
      scoreLead(
        many(10, () => sig('oss-activity', 1, 'new-repo')),
        now,
      ),
    ).toBe(15);
  });

  it('website-tech: 5 once', () => {
    expect(scoreLead([sig('website-tech', 1)], now)).toBe(5);
    expect(
      scoreLead(
        many(6, () => sig('website-tech', 1)),
        now,
      ),
    ).toBe(5);
  });

  it('funding: up to 20 with recency, no stacking', () => {
    expect(scoreLead([sig('funding', 1)], now)).toBe(20);
    expect(scoreLead([sig('funding', 20)], now)).toBe(10);
    expect(
      scoreLead(
        many(4, () => sig('funding', 1)),
        now,
      ),
    ).toBe(20);
  });

  it('adds +10 per extra live type and sums per-type components', () => {
    expect(scoreLead([sig('hiring', 1), sig('filing', 1)], now)).toBe(15 + 25 + 10);
    expect(
      scoreLead(
        [
          sig('hiring', 1),
          sig('filing', 1),
          sig('oss-activity', 1, 'new-repo'),
          sig('website-tech', 1),
        ],
        now,
      ),
    ).toBe(15 + 25 + 8 + 5 + 30);
    // a dead signal neither scores nor counts as a type
    expect(scoreLead([sig('hiring', 1), sig('filing', 200)], now)).toBe(15);
  });

  it('weights fresher signals above staler ones, per type', () => {
    for (const type of ['hiring', 'oss-activity', 'funding'] as const) {
      expect(scoreLead([sig(type, 1)], now)).toBeGreaterThan(scoreLead([sig(type, 20)], now));
      expect(scoreLead([sig(type, 20)], now)).toBeGreaterThan(scoreLead([sig(type, 60)], now));
    }
    expect(scoreLead([sig('filing', 10)], now)).toBeGreaterThan(
      scoreLead([sig('filing', 60)], now),
    );
  });

  it('is monotonic: adding a signal never lowers the score, and always stays within 0-100', () => {
    const pool: ScorableSignal[] = [
      sig('hiring', 3),
      sig('hiring', 40),
      sig('filing', 50),
      sig('filing', 2),
      sig('oss-activity', 10, 'release'),
      sig('oss-activity', 5, 'new-repo'),
      sig('funding', 70),
      sig('website-tech', 1),
      sig('hiring', 300),
    ];
    let acc: ScorableSignal[] = [];
    let previous = 0;
    for (const s of pool) {
      acc = [...acc, s];
      const score = scoreLead(acc, now);
      expect(score).toBeGreaterThanOrEqual(previous);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
      previous = score;
    }
    expect(scoreLead(many(200, () => sig('funding', 1)).concat(pool), now)).toBeLessThanOrEqual(
      100,
    );
  });

  it('is deterministic and independent of signal order', () => {
    const a = [sig('hiring', 1), sig('filing', 10), sig('oss-activity', 3, 'release')];
    expect(scoreLead(a, now)).toBe(scoreLead([...a].reverse(), now));
  });
});
