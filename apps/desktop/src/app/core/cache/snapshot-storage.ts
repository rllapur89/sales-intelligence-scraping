import { InjectionToken } from '@angular/core';
import type { Snapshot } from './snapshot.helpers';
import { IndexedDbSnapshotStorage } from './indexeddb-snapshot-storage';

/**
 * Persistence of ONE snapshot. Implementations never reject: failures are logged and surface as
 * `null` (get) or a no-op (put/clear), so the cache can never break the app.
 */
export interface SnapshotStorage {
  get(): Promise<Snapshot | null>;
  put(snapshot: Snapshot): Promise<void>;
  clear(): Promise<void>;
}

/** In-memory storage: tests and environments without IndexedDB (SSR). Stores a deep copy. */
export class MemorySnapshotStorage implements SnapshotStorage {
  private value: string | null = null;

  async get(): Promise<Snapshot | null> {
    if (this.value === null) return null;
    try {
      return JSON.parse(this.value) as Snapshot;
    } catch {
      return null;
    }
  }

  async put(snapshot: Snapshot): Promise<void> {
    try {
      this.value = JSON.stringify(snapshot);
    } catch (err) {
      console.warn('[snapshot-cache] could not serialize snapshot', err);
    }
  }

  async clear(): Promise<void> {
    this.value = null;
  }
}

/** IndexedDB in the browser / Electron renderer, memory everywhere else. */
export const SNAPSHOT_STORAGE = new InjectionToken<SnapshotStorage>('SNAPSHOT_STORAGE', {
  providedIn: 'root',
  factory: () =>
    typeof indexedDB !== 'undefined'
      ? new IndexedDbSnapshotStorage(indexedDB)
      : new MemorySnapshotStorage(),
});
