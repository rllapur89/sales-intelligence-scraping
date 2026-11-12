import { describe, expect, it, vi } from 'vitest';
import { LEAD_EVENTS_CHANNEL, type LeadUpsertedEvent } from '@leads/shared';
import { createRng } from './rng';
import { runPublisher } from './publisher';
import { SyntheticLeads } from './synthetic';

function fakeClock() {
  let t = 0;
  return {
    now: () => t,
    sleep: (ms: number) => {
      t += ms;
      return Promise.resolve();
    },
  };
}

describe('runPublisher', () => {
  it('publishes about rate x duration events to the lead channel', async () => {
    const clock = fakeClock();
    const gen = new SyntheticLeads(createRng(1), clock.now);
    const publish = vi.fn().mockResolvedValue(1);
    const result = await runPublisher(() => gen.next(), publish, {
      ratePerSecond: 500,
      durationMs: 2000,
      ...clock,
    });
    // The last 10 ms tick is not published because the loop stops at the deadline.
    expect(result.published).toBeGreaterThanOrEqual(990);
    expect(result.published).toBeLessThanOrEqual(1000);
    expect(result.achievedRate).toBeGreaterThan(495);
    expect(publish.mock.calls.every((c) => c[0] === LEAD_EVENTS_CHANNEL)).toBe(true);
  });

  it('stamps ingestedAt at publish time and sends valid JSON events', async () => {
    const clock = fakeClock();
    const gen = new SyntheticLeads(createRng(2), () => 0);
    const messages: string[] = [];
    await runPublisher(
      () => gen.next(),
      (_c, m) => {
        messages.push(m);
        return Promise.resolve(1);
      },
      { ratePerSecond: 100, durationMs: 100, ...clock },
    );
    const first = JSON.parse(messages[0] as string) as LeadUpsertedEvent;
    expect(first.type).toBe('lead.upserted');
    expect(first.timings.ingestedAt).toBeGreaterThan(first.timings.scrapedAt);
  });

  it('caps the catch-up burst after a stall', async () => {
    let t = 0;
    const perTick: number[] = [];
    let sinceTick = 0;
    const gen = new SyntheticLeads(createRng(3), () => t);
    await runPublisher(
      () => gen.next(),
      () => {
        sinceTick += 1;
        return Promise.resolve(1);
      },
      {
        ratePerSecond: 1000,
        durationMs: 3000,
        maxBurst: 50,
        now: () => t,
        sleep: () => {
          perTick.push(sinceTick);
          sinceTick = 0;
          t += perTick.length === 1 ? 2000 : 10; // first tick stalls for 2 s
          return Promise.resolve();
        },
      },
    );
    expect(Math.max(...perTick)).toBeLessThanOrEqual(50);
  });

  it('publishes nothing when the duration is zero', async () => {
    const clock = fakeClock();
    const publish = vi.fn();
    const gen = new SyntheticLeads(createRng(4), clock.now);
    const result = await runPublisher(() => gen.next(), publish, {
      ratePerSecond: 500,
      durationMs: 0,
      ...clock,
    });
    expect(result.published).toBe(0);
    expect(publish).not.toHaveBeenCalled();
  });
});
