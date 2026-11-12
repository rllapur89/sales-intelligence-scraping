import { EnvironmentProviders, Injectable, effect, inject, provideEnvironmentInitializer } from '@angular/core';
import { AuthService } from '../auth/auth.service';
import { DATA_MODE, ENVIRONMENT } from '../config/app-environment';
import type { Lead } from '../models/lead.model';
import { SNAPSHOT_STORAGE } from './snapshot-storage';
import { Snapshot, SNAPSHOT_VERSION, capLeads, isSnapshotUsable } from './snapshot.helpers';

/** Applies the cache policy (size cap, max age, corrupt-data handling) on top of a storage. */
@Injectable({ providedIn: 'root' })
export class SnapshotCache {
  private readonly storage = inject(SNAPSHOT_STORAGE);
  private readonly env = inject(ENVIRONMENT);

  /** The cached snapshot, or null when missing, too old or corrupt (corrupt data is dropped). */
  async load(now: number = Date.now()): Promise<Snapshot | null> {
    try {
      const snapshot = await this.storage.get();
      if (snapshot === null) return null;
      if (isSnapshotUsable(snapshot, now, this.env.snapshotMaxAgeMs)) return snapshot;
      await this.storage.clear();
      return null;
    } catch (err) {
      console.warn('[snapshot-cache] load failed', err);
      return null;
    }
  }

  /** Saves the highest-score `snapshotMaxLeads` leads together with the last applied seq. */
  async save(leads: readonly Lead[], lastSeq: number, now: number = Date.now()): Promise<void> {
    try {
      await this.storage.put({
        version: SNAPSHOT_VERSION,
        savedAt: now,
        lastSeq,
        leads: capLeads(leads, this.env.snapshotMaxLeads),
      });
    } catch (err) {
      console.warn('[snapshot-cache] save failed', err);
    }
  }

  async clear(): Promise<void> {
    try {
      await this.storage.clear();
    } catch (err) {
      console.warn('[snapshot-cache] clear failed', err);
    }
  }
}

/**
 * Live mode only: wipes the cache when the session ends (logout, failed token refresh) or another
 * user signs in, so a different user never sees the previous user's leads.
 */
export function provideSnapshotCacheClearing(): EnvironmentProviders {
  return provideEnvironmentInitializer(() => {
    if (inject(DATA_MODE) !== 'live') return;
    const auth = inject(AuthService);
    const cache = inject(SnapshotCache);
    let previousId: string | null = null;
    effect(() => {
      const id = auth.user()?.id ?? null;
      if (id === null || (previousId !== null && previousId !== id)) void cache.clear();
      previousId = id;
    });
  });
}
