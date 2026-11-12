import { DEFAULT_SNAPSHOT_MAX_AGE_MS, Snapshot, capLeads, isSnapshotUsable } from './snapshot.helpers';
import { makeLead } from '../../../testing/factories';

const NOW = 1_700_000_000_000;
const snap = (over: Partial<Snapshot> = {}): Snapshot => ({
  version: 1,
  savedAt: NOW - 1000,
  lastSeq: 10,
  leads: [makeLead({ id: 'a' })],
  ...over,
});

describe('isSnapshotUsable', () => {
  it('accepts a fresh, well-formed snapshot', () => {
    expect(isSnapshotUsable(snap(), NOW)).toBe(true);
  });

  it('accepts an empty lead list', () => {
    expect(isSnapshotUsable(snap({ leads: [] }), NOW)).toBe(true);
  });

  it('defaults the max age to 7 days', () => {
    expect(DEFAULT_SNAPSHOT_MAX_AGE_MS).toBe(7 * 24 * 3600 * 1000);
    expect(isSnapshotUsable(snap({ savedAt: NOW - DEFAULT_SNAPSHOT_MAX_AGE_MS }), NOW)).toBe(true);
    expect(isSnapshotUsable(snap({ savedAt: NOW - DEFAULT_SNAPSHOT_MAX_AGE_MS - 1 }), NOW)).toBe(false);
  });

  it('honours an explicit max age', () => {
    expect(isSnapshotUsable(snap({ savedAt: NOW - 5000 }), NOW, 4000)).toBe(false);
    expect(isSnapshotUsable(snap({ savedAt: NOW - 5000 }), NOW, 6000)).toBe(true);
  });

  it('rejects another version', () => {
    expect(isSnapshotUsable({ ...snap(), version: 2 }, NOW)).toBe(false);
  });

  it('rejects a savedAt far in the future but tolerates small skew', () => {
    expect(isSnapshotUsable(snap({ savedAt: NOW + 3_600_000 }), NOW)).toBe(false);
    expect(isSnapshotUsable(snap({ savedAt: NOW + 5000 }), NOW)).toBe(true);
  });

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['a string', 'x'],
    ['a number', 42],
    ['an array', []],
    ['an empty object', {}],
  ])('rejects %s', (_name, value) => {
    expect(isSnapshotUsable(value, NOW)).toBe(false);
  });

  it('rejects bad field types', () => {
    expect(isSnapshotUsable({ ...snap(), savedAt: '1' }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), savedAt: NaN }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), lastSeq: -1 }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), lastSeq: Infinity }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), leads: {} }, NOW)).toBe(false);
  });

  it('rejects corrupt leads', () => {
    expect(isSnapshotUsable({ ...snap(), leads: [null] }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), leads: [{ id: 'x' }] }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), leads: [{ ...makeLead(), score: 'high' }] }, NOW)).toBe(false);
    expect(isSnapshotUsable({ ...snap(), leads: [makeLead(), { ...makeLead(), id: '' }] }, NOW)).toBe(false);
  });
});

describe('capLeads', () => {
  const leads = [
    makeLead({ id: 'a', score: 10 }),
    makeLead({ id: 'b', score: 90 }),
    makeLead({ id: 'c', score: 50 }),
    makeLead({ id: 'd', score: 70 }),
  ];

  it('keeps the highest-score leads', () => {
    expect(capLeads(leads, 2).map(l => l.id)).toEqual(['b', 'd']);
  });

  it('breaks score ties by newest seq', () => {
    const tied = [makeLead({ id: 'old', score: 5, seq: 1 }), makeLead({ id: 'new', score: 5, seq: 9 })];
    expect(capLeads(tied, 1).map(l => l.id)).toEqual(['new']);
  });

  it('returns a copy, in original order, when under the cap', () => {
    const out = capLeads(leads, 10);
    expect(out).toEqual(leads);
    expect(out).not.toBe(leads);
  });

  it('does not mutate the input', () => {
    const copy = [...leads];
    capLeads(leads, 2);
    expect(leads).toEqual(copy);
  });

  it('returns nothing for a non-positive max', () => {
    expect(capLeads(leads, 0)).toEqual([]);
    expect(capLeads(leads, -3)).toEqual([]);
    expect(capLeads(leads, NaN)).toEqual([]);
  });
});
