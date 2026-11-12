import type { Snapshot } from './snapshot.helpers';

export const SNAPSHOT_DB_NAME = 'leads-sales-intelligence';
export const SNAPSHOT_STORE_NAME = 'snapshot';
const SNAPSHOT_KEY = 'latest';

/** Wraps an IDBRequest into a promise. */
function request<T>(req: IDBRequest<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB request failed'));
  });
}

/** Resolves when the transaction committed. */
function committed(tx: IDBTransaction): Promise<void> {
  return new Promise((resolve, reject) => {
    tx.oncomplete = () => resolve();
    tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'));
    tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'));
  });
}

/**
 * Snapshot storage on IndexedDB. The factory is injected so tests can pass a fake; any failure
 * (missing API, blocked open, quota, aborted transaction) is logged and swallowed.
 */
export class IndexedDbSnapshotStorage {
  private dbPromise: Promise<IDBDatabase> | null = null;

  constructor(
    private readonly factory: IDBFactory,
    private readonly dbName: string = SNAPSHOT_DB_NAME
  ) {}

  async get(): Promise<Snapshot | null> {
    try {
      const db = await this.open();
      const store = db.transaction(SNAPSHOT_STORE_NAME, 'readonly').objectStore(SNAPSHOT_STORE_NAME);
      const value = await request(store.get(SNAPSHOT_KEY));
      return (value as Snapshot | undefined) ?? null;
    } catch (err) {
      this.fail('read', err);
      return null;
    }
  }

  async put(snapshot: Snapshot): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      const done = committed(tx);
      tx.objectStore(SNAPSHOT_STORE_NAME).put(snapshot, SNAPSHOT_KEY);
      await done;
    } catch (err) {
      this.fail('write', err);
    }
  }

  async clear(): Promise<void> {
    try {
      const db = await this.open();
      const tx = db.transaction(SNAPSHOT_STORE_NAME, 'readwrite');
      const done = committed(tx);
      tx.objectStore(SNAPSHOT_STORE_NAME).delete(SNAPSHOT_KEY);
      await done;
    } catch (err) {
      this.fail('clear', err);
    }
  }

  private open(): Promise<IDBDatabase> {
    if (!this.dbPromise) {
      this.dbPromise = new Promise<IDBDatabase>((resolve, reject) => {
        const req = this.factory.open(this.dbName, 1);
        req.onupgradeneeded = () => {
          const db = req.result;
          if (!db.objectStoreNames.contains(SNAPSHOT_STORE_NAME)) db.createObjectStore(SNAPSHOT_STORE_NAME);
        };
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
        req.onblocked = () => reject(new Error('IndexedDB open blocked'));
      });
      // A failed open must be retried on the next call, not cached forever.
      this.dbPromise.catch(() => (this.dbPromise = null));
    }
    return this.dbPromise;
  }

  private fail(action: string, err: unknown): void {
    console.warn(`[snapshot-cache] IndexedDB ${action} failed`, err);
  }
}
