import { describe, expect, it } from 'vitest';
import { createRng, pick, pickMany } from './rng';

describe('createRng', () => {
  it('is deterministic for a seed', () => {
    const a = createRng(7);
    const b = createRng(7);
    expect(Array.from({ length: 5 }, a)).toEqual(Array.from({ length: 5 }, b));
  });

  it('differs between seeds', () => {
    expect(createRng(1)()).not.toBe(createRng(2)());
  });

  it('stays inside [0, 1)', () => {
    const rng = createRng(99);
    for (let i = 0; i < 1000; i++) {
      const v = rng();
      expect(v).toBeGreaterThanOrEqual(0);
      expect(v).toBeLessThan(1);
    }
  });
});

describe('pick helpers', () => {
  it('pick returns one of the items and throws on an empty list', () => {
    expect(['a', 'b', 'c']).toContain(pick(createRng(3), ['a', 'b', 'c']));
    expect(() => pick(createRng(3), [])).toThrow();
  });

  it('pickMany returns distinct items and caps at the pool size', () => {
    const picked = pickMany(createRng(5), [1, 2, 3, 4], 3);
    expect(new Set(picked).size).toBe(3);
    expect(pickMany(createRng(5), [1, 2], 10)).toHaveLength(2);
    expect(pickMany(createRng(5), [1, 2], 0)).toEqual([]);
  });
});
