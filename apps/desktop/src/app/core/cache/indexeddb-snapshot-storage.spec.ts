import { IndexedDbSnapshotStorage, SNAPSHOT_STORE_NAME } from './indexeddb-snapshot-storage';
import type { Snapshot } from './snapshot.helpers';
import { makeLead } from '../../../testing/factories';

interface FakeOptions {
  failOpen?: boolean;
  failTx?: boolean;
  throwOnOpen?: boolean;
}

type Handler = (() => void) | undefined;

function later(fn: () => void): void {
  setTimeout(fn, 0);
}

/** Minimal fake of the IndexedDB surface used by the wrapper; callbacks fire asynchronously. */
function createFakeFactory(opts: FakeOptions = {}) {
  const data = new Map<string, unknown>();
  const stores = new Set<string>();
  const state = { opens: 0 };

  const db = {
    objectStoreNames: { contains: (n: string) => stores.has(n) },
    createObjectStore: (n: string) => {
      stores.add(n);
    },
    transaction: () => {
      const tx: Record<string, unknown> = { error: null };
      const finish = () =>
        later(() => {
          if (opts.failTx) {
            tx['error'] = new Error('tx failed');
            (tx['onerror'] as Handler)?.();
          } else {
            (tx['oncomplete'] as Handler)?.();
          }
        });
      tx['objectStore'] = () => ({
        get: (key: string) => {
          const req: Record<string, unknown> = {};
          later(() => {
            if (opts.failTx) {
              req['error'] = new Error('read failed');
              (req['onerror'] as Handler)?.();
            } else {
              req['result'] = data.get(key);
              (req['onsuccess'] as Handler)?.();
            }
          });
          return req;
        },
        put: (value: unknown, key: string) => {
          if (!opts.failTx) data.set(key, structuredClone(value));
          finish();
        },
        delete: (key: string) => {
          if (!opts.failTx) data.delete(key);
          finish();
        },
      });
      return tx;
    },
  };

  const factory = {
    open: () => {
      state.opens++;
      if (opts.throwOnOpen) throw new Error('denied');
      const req: Record<string, unknown> = { result: db };
      later(() => {
        if (opts.failOpen) {
          req['error'] = new Error('open failed');
          (req['onerror'] as Handler)?.();
          return;
        }
        if (!stores.size) (req['onupgradeneeded'] as Handler)?.();
        (req['onsuccess'] as Handler)?.();
      });
      return req;
    },
  } as unknown as IDBFactory;

  return { factory, data, stores, state };
}

const snap = (lastSeq = 1): Snapshot => ({ version: 1, savedAt: 1000, lastSeq, leads: [makeLead({ id: 'a' })] });

describe('IndexedDbSnapshotStorage', () => {
  let warn: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warn = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
  });
  afterEach(() => warn.mockRestore());

  it('creates the object store on first open and returns null when empty', async () => {
    const fake = createFakeFactory();
    const storage = new IndexedDbSnapshotStorage(fake.factory);
    expect(await storage.get()).toBeNull();
    expect(fake.stores.has(SNAPSHOT_STORE_NAME)).toBe(true);
  });

  it('round-trips and replaces the snapshot', async () => {
    const fake = createFakeFactory();
    const storage = new IndexedDbSnapshotStorage(fake.factory);
    await storage.put(snap(1));
    await storage.put(snap(2));
    expect(await storage.get()).toEqual(snap(2));
    expect(fake.data.size).toBe(1);
  });

  it('clear removes the snapshot', async () => {
    const storage = new IndexedDbSnapshotStorage(createFakeFactory().factory);
    await storage.put(snap());
    await storage.clear();
    expect(await storage.get()).toBeNull();
  });

  it('opens the database once and reuses the connection', async () => {
    const fake = createFakeFactory();
    const storage = new IndexedDbSnapshotStorage(fake.factory);
    await storage.put(snap());
    await storage.get();
    await storage.clear();
    expect(fake.state.opens).toBe(1);
  });

  it('never throws when open fails: get is null, put/clear are no-ops, and it logs', async () => {
    const storage = new IndexedDbSnapshotStorage(createFakeFactory({ failOpen: true }).factory);
    expect(await storage.get()).toBeNull();
    await expect(storage.put(snap())).resolves.toBeUndefined();
    await expect(storage.clear()).resolves.toBeUndefined();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('retries opening after a failed open', async () => {
    const fake = createFakeFactory({ failOpen: true });
    const storage = new IndexedDbSnapshotStorage(fake.factory);
    await storage.get();
    await storage.get();
    expect(fake.state.opens).toBe(2);
  });

  it('never throws when the factory itself throws', async () => {
    const storage = new IndexedDbSnapshotStorage(createFakeFactory({ throwOnOpen: true }).factory);
    expect(await storage.get()).toBeNull();
    await expect(storage.put(snap())).resolves.toBeUndefined();
  });

  it('never throws on failed transactions and leaves stored data untouched', async () => {
    const fake = createFakeFactory({ failTx: true });
    const storage = new IndexedDbSnapshotStorage(fake.factory);
    expect(await storage.get()).toBeNull();
    await expect(storage.put(snap())).resolves.toBeUndefined();
    await expect(storage.clear()).resolves.toBeUndefined();
    expect(fake.data.size).toBe(0);
  });
});
