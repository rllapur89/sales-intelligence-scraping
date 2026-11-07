import { describe, expect, it } from 'vitest';
import { buildQueueRegistry } from './queue-registry';

describe('buildQueueRegistry', () => {
  it('has one queue per source plus ingestion, all with unique names', () => {
    const registry = buildQueueRegistry();
    expect(registry).toHaveLength(8);
    expect(new Set(registry.map((q) => q.name)).size).toBe(8);
    expect(registry.filter((q) => q.source === null).map((q) => q.name)).toEqual(['ingestion']);
  });
});
