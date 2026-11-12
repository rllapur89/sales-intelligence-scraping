import { describe, expect, it } from 'vitest';
import { DEFAULTS, readConfig } from './config';

describe('readConfig', () => {
  it('returns the defaults for an empty environment', () => {
    expect(readConfig({})).toEqual(DEFAULTS);
  });

  it('reads overrides and trims the trailing slash of the API url', () => {
    const config = readConfig({
      LOADTEST_API_URL: 'http://api:3000//',
      LOADTEST_CLIENTS: '200',
      LOADTEST_USERS: '10',
      LOADTEST_EVENTS_PER_SECOND: '100',
      LOADTEST_REPORT: 'out.md',
    });
    expect(config).toMatchObject({
      apiUrl: 'http://api:3000',
      clients: 200,
      users: 10,
      eventsPerSecond: 100,
      reportPath: 'out.md',
    });
  });

  it('falls back to REDIS_URL when no loadtest redis url is given', () => {
    expect(readConfig({ REDIS_URL: 'redis://r:1' }).redisUrl).toBe('redis://r:1');
    expect(
      readConfig({ REDIS_URL: 'redis://r:1', LOADTEST_REDIS_URL: 'redis://x:2' }).redisUrl,
    ).toBe('redis://x:2');
  });

  it.each(['0', '-3', '2.5', 'abc'])('rejects %s as a count', (value) => {
    expect(() => readConfig({ LOADTEST_CLIENTS: value })).toThrow('LOADTEST_CLIENTS');
  });

  it('rejects more users than clients', () => {
    expect(() => readConfig({ LOADTEST_CLIENTS: '5', LOADTEST_USERS: '6' })).toThrow('USERS');
  });
});
