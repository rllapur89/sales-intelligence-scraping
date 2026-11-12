/** Default cap of lead ids remembered per socket (see ADR 0005). */
export const DEFAULT_HELD_LIMIT = 50_000;

/**
 * Insertion-ordered set of ids with a hard size cap. When full, the oldest id is dropped first.
 * Re-adding an id refreshes its position, so recently delivered leads are the last to be evicted.
 * Memory per instance is therefore at most `limit` ids, whatever the traffic.
 */
export class BoundedIdSet {
  private readonly ids = new Set<string>();

  constructor(readonly limit: number = DEFAULT_HELD_LIMIT) {
    if (!Number.isInteger(limit) || limit < 1) {
      throw new RangeError('BoundedIdSet limit must be a positive integer');
    }
  }

  get size(): number {
    return this.ids.size;
  }

  has(id: string): boolean {
    return this.ids.has(id);
  }

  /** Adds or refreshes `id`; returns the ids evicted to stay within the limit (oldest first). */
  add(id: string): string[] {
    this.ids.delete(id);
    this.ids.add(id);
    const evicted: string[] = [];
    while (this.ids.size > this.limit) {
      const oldest = this.ids.values().next().value as string;
      this.ids.delete(oldest);
      evicted.push(oldest);
    }
    return evicted;
  }

  delete(id: string): boolean {
    return this.ids.delete(id);
  }

  clear(): void {
    this.ids.clear();
  }

  /** Oldest first. */
  values(): IterableIterator<string> {
    return this.ids.values();
  }
}
