import { describe, expect, it } from 'vitest';
import { dueEvents } from './pacer';

describe('dueEvents', () => {
  it('is proportional to the elapsed time', () => {
    expect(dueEvents(500, 1000, 0)).toBe(500);
    expect(dueEvents(500, 100, 0)).toBe(50);
  });

  it('subtracts what was already sent', () => {
    expect(dueEvents(500, 1000, 480)).toBe(20);
  });

  it('never goes negative when ahead of schedule', () => {
    expect(dueEvents(100, 1000, 150)).toBe(0);
  });

  it('catches up after a stall but respects the burst cap', () => {
    expect(dueEvents(500, 2000, 0)).toBe(1000);
    expect(dueEvents(500, 2000, 0, 200)).toBe(200);
  });

  it('is 0 for a non-positive rate or no elapsed time', () => {
    expect(dueEvents(0, 1000, 0)).toBe(0);
    expect(dueEvents(-5, 1000, 0)).toBe(0);
    expect(dueEvents(500, 0, 0)).toBe(0);
  });

  it('keeps the long-run average on the target rate across ticks', () => {
    let sent = 0;
    for (let t = 10; t <= 10_000; t += 10) sent += dueEvents(333, t, sent);
    expect(sent).toBe(3330);
  });
});
