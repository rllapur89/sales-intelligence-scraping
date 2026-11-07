import { describe, expect, it } from 'vitest';
import { validateEnv } from './env';

const base = {
  DATABASE_URL: 'postgresql://u:p@localhost:5432/db',
  REDIS_URL: 'redis://localhost:6379',
};

describe('validateEnv', () => {
  it('applies defaults', () => {
    const env = validateEnv(base);
    expect(env.port).toBe(3000);
    expect(env.corsOrigin).toBe('http://localhost:4200');
  });

  it('rejects a missing DATABASE_URL', () => {
    expect(() => validateEnv({ REDIS_URL: base.REDIS_URL })).toThrow('DATABASE_URL');
  });

  it('rejects an invalid port', () => {
    expect(() => validateEnv({ ...base, API_PORT: '99999' })).toThrow('API_PORT');
  });
});
