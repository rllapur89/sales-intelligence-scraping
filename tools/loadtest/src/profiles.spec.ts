import { describe, expect, it } from 'vitest';
import { buildProfile, buildProfiles, clientsPerUser, INDUSTRIES, REGIONS } from './profiles';
import { createRng } from './rng';

describe('buildProfile', () => {
  it('shape 0 is a firehose with no restrictions', () => {
    expect(buildProfile(0, createRng(1))).toEqual({
      industries: [],
      regions: [],
      signalTypes: [],
      minScore: 0,
    });
  });

  it('shape 1 restricts one industry only', () => {
    const f = buildProfile(1, createRng(1));
    expect(f.industries).toHaveLength(1);
    expect(INDUSTRIES).toContain(f.industries[0]);
    expect(f.regions).toEqual([]);
  });

  it('shape 2 restricts one region and one signal type', () => {
    const f = buildProfile(2, createRng(1));
    expect(f.regions).toHaveLength(1);
    expect(REGIONS).toContain(f.regions[0]);
    expect(f.signalTypes).toHaveLength(1);
  });

  it('shape 3 only sets a high minimum score', () => {
    expect(buildProfile(3, createRng(1))).toMatchObject({ minScore: 70, industries: [] });
  });

  it('shape 4 combines two industries, two regions and two signal types', () => {
    const f = buildProfile(4, createRng(1));
    expect(f.industries).toHaveLength(2);
    expect(f.regions).toHaveLength(2);
    expect(f.signalTypes).toHaveLength(2);
    expect(f.minScore).toBe(40);
  });

  it('cycles shapes every five users', () => {
    const profiles = buildProfiles(10, createRng(9));
    expect(profiles).toHaveLength(10);
    expect(profiles[5]).toEqual(profiles[0]);
    expect(profiles[8]?.minScore).toBe(70);
  });
});

describe('clientsPerUser', () => {
  it('splits evenly and gives the remainder to the first users', () => {
    expect(clientsPerUser(10, 3)).toEqual([4, 3, 3]);
    expect(clientsPerUser(9, 3)).toEqual([3, 3, 3]);
  });

  it('always adds up to the client count', () => {
    const split = clientsPerUser(1000, 37);
    expect(split.reduce((a, b) => a + b, 0)).toBe(1000);
    expect(Math.max(...split) - Math.min(...split)).toBeLessThanOrEqual(1);
  });
});
