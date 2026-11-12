import { MemorySnapshotStorage } from './snapshot-storage';
import type { Snapshot } from './snapshot.helpers';
import { makeLead } from '../../../testing/factories';

const snap = (lastSeq = 1): Snapshot => ({ version: 1, savedAt: 1000, lastSeq, leads: [makeLead({ id: 'a' })] });

describe('MemorySnapshotStorage', () => {
  it('starts empty', async () => {
    expect(await new MemorySnapshotStorage().get()).toBeNull();
  });

  it('round-trips a snapshot', async () => {
    const storage = new MemorySnapshotStorage();
    await storage.put(snap(5));
    expect(await storage.get()).toEqual(snap(5));
  });

  it('keeps only the last snapshot', async () => {
    const storage = new MemorySnapshotStorage();
    await storage.put(snap(1));
    await storage.put(snap(2));
    expect((await storage.get())?.lastSeq).toBe(2);
  });

  it('stores a copy, isolated from later mutation', async () => {
    const storage = new MemorySnapshotStorage();
    const s = snap();
    await storage.put(s);
    s.leads.length = 0;
    expect((await storage.get())?.leads).toHaveLength(1);
  });

  it('clear removes the snapshot and is idempotent', async () => {
    const storage = new MemorySnapshotStorage();
    await storage.put(snap());
    await storage.clear();
    await storage.clear();
    expect(await storage.get()).toBeNull();
  });

  it('does not throw on a non-serializable snapshot', async () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const storage = new MemorySnapshotStorage();
    const circular = snap() as unknown as Record<string, unknown>;
    circular['self'] = circular;
    await expect(storage.put(circular as unknown as Snapshot)).resolves.toBeUndefined();
    expect(await storage.get()).toBeNull();
    warn.mockRestore();
  });
});
