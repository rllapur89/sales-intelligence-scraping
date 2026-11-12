import { describe, expect, it } from 'vitest';
import { BoundedIdSet, DEFAULT_HELD_LIMIT } from './bounded-id-set';

describe('BoundedIdSet', () => {
  it('defaults to 50,000 ids', () => {
    expect(new BoundedIdSet().limit).toBe(DEFAULT_HELD_LIMIT);
    expect(DEFAULT_HELD_LIMIT).toBe(50_000);
  });

  it('rejects a limit that is not a positive integer', () => {
    expect(() => new BoundedIdSet(0)).toThrow(RangeError);
    expect(() => new BoundedIdSet(-1)).toThrow(RangeError);
    expect(() => new BoundedIdSet(1.5)).toThrow(RangeError);
  });

  it('adds, tests and deletes ids', () => {
    const set = new BoundedIdSet(3);
    expect(set.add('a')).toEqual([]);
    expect(set.has('a')).toBe(true);
    expect(set.has('b')).toBe(false);
    expect(set.delete('a')).toBe(true);
    expect(set.delete('a')).toBe(false);
    expect(set.size).toBe(0);
  });

  it('drops the oldest id first when the limit is exceeded', () => {
    const set = new BoundedIdSet(3);
    for (const id of ['a', 'b', 'c']) set.add(id);
    expect(set.add('d')).toEqual(['a']);
    expect([...set.values()]).toEqual(['b', 'c', 'd']);
    expect(set.has('a')).toBe(false);
    expect(set.size).toBe(3);
  });

  it('re-adding an id refreshes it so it is evicted last', () => {
    const set = new BoundedIdSet(3);
    for (const id of ['a', 'b', 'c']) set.add(id);
    expect(set.add('a')).toEqual([]);
    expect(set.size).toBe(3);
    expect(set.add('d')).toEqual(['b']);
    expect([...set.values()]).toEqual(['c', 'a', 'd']);
  });

  it('never grows past the limit under sustained traffic', () => {
    const set = new BoundedIdSet(100);
    for (let i = 0; i < 10_000; i++) set.add(`lead-${i}`);
    expect(set.size).toBe(100);
    expect(set.has('lead-9999')).toBe(true);
    expect(set.has('lead-9899')).toBe(false);
  });

  it('works with a limit of one', () => {
    const set = new BoundedIdSet(1);
    set.add('a');
    expect(set.add('b')).toEqual(['a']);
    expect([...set.values()]).toEqual(['b']);
  });

  it('clear empties the set', () => {
    const set = new BoundedIdSet(3);
    set.add('a');
    set.clear();
    expect(set.size).toBe(0);
    expect(set.has('a')).toBe(false);
  });
});
