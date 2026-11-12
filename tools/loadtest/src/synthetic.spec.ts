import { describe, expect, it } from 'vitest';
import { SIGNAL_TYPES } from '@leads/shared';
import { createRng } from './rng';
import { SYNTHETIC_SEQ_BASE, SyntheticLeads } from './synthetic';

describe('SyntheticLeads', () => {
  it('emits increasing sequence numbers above the synthetic base', () => {
    const gen = new SyntheticLeads(createRng(1), () => 5000);
    const a = gen.next();
    const b = gen.next();
    expect(a.seq).toBe(SYNTHETIC_SEQ_BASE + 1);
    expect(b.seq).toBe(SYNTHETIC_SEQ_BASE + 2);
    expect(b.lead.seq).toBe(b.seq);
  });

  it('is reproducible for the same seed and clock', () => {
    const a = new SyntheticLeads(createRng(11), () => 1);
    const b = new SyntheticLeads(createRng(11), () => 1);
    expect(a.next()).toEqual(b.next());
  });

  it('produces valid leads with no personal data and the reserved .invalid domain', () => {
    const gen = new SyntheticLeads(createRng(2), () => 1);
    for (let i = 0; i < 200; i++) {
      const { lead } = gen.next();
      expect(lead.company.domain.endsWith('.loadtest.invalid')).toBe(true);
      expect(lead.score).toBeGreaterThanOrEqual(0);
      expect(lead.score).toBeLessThanOrEqual(100);
      expect(lead.signalTypes.length).toBe(lead.signalCount);
      for (const t of lead.signalTypes) expect(SIGNAL_TYPES).toContain(t);
    }
  });

  it('reuses lead ids from a bounded pool', () => {
    const gen = new SyntheticLeads(createRng(3), () => 1, 3);
    const ids = new Set(Array.from({ length: 50 }, () => gen.next().lead.id));
    expect(ids.size).toBeLessThanOrEqual(3);
  });

  it('stamps scrapedAt from the injected clock', () => {
    const event = new SyntheticLeads(createRng(4), () => 1234).next();
    expect(event.timings.scrapedAt).toBe(1234);
  });
});
