import { describe, expect, it } from 'vitest';
import { SOURCE_KEYS, scrapeQueueName } from './sources';

describe('scrapeQueueName', () => {
  it('gives every source its own distinct queue', () => {
    const names = SOURCE_KEYS.map(scrapeQueueName);
    expect(new Set(names).size).toBe(SOURCE_KEYS.length);
  });

  it('never contains a colon, which BullMQ rejects', () => {
    for (const key of SOURCE_KEYS) expect(scrapeQueueName(key)).not.toContain(':');
  });

  it('uses the scrape- prefix', () => {
    expect(scrapeQueueName('greenhouse')).toBe('scrape-greenhouse');
  });
});
