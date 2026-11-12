export interface LoadTestConfig {
  apiUrl: string;
  redisUrl: string;
  /** Total websocket clients. */
  clients: number;
  /** Distinct users; clients are spread evenly across them, each user has its own subscription. */
  users: number;
  /** Synthetic events published per second. */
  eventsPerSecond: number;
  durationSeconds: number;
  /** Clients open in waves of this size, to avoid a thundering herd at start. */
  rampBatchSize: number;
  rampDelayMs: number;
  /** One in N delivered leads is acked back to the API. */
  ackEveryNth: number;
  /** Seed of the deterministic generators, so two runs publish the same events. */
  seed: number;
  /** Where the markdown report is written, or null to print only. */
  reportPath: string | null;
}

export const DEFAULTS: LoadTestConfig = {
  apiUrl: 'http://localhost:3000',
  redisUrl: 'redis://localhost:6379',
  clients: 1000,
  users: 50,
  eventsPerSecond: 500,
  durationSeconds: 60,
  rampBatchSize: 50,
  rampDelayMs: 250,
  ackEveryNth: 10,
  seed: 42,
  reportPath: null,
};

function positiveInt(
  env: Record<string, string | undefined>,
  key: string,
  fallback: number,
): number {
  const raw = env[key];
  if (raw === undefined || raw.trim() === '') return fallback;
  const n = Number(raw);
  if (!Number.isInteger(n) || n <= 0) {
    throw new Error(`${key} must be a positive integer, got "${raw}"`);
  }
  return n;
}

function text(env: Record<string, string | undefined>, key: string, fallback: string): string {
  const raw = env[key]?.trim();
  return raw ? raw : fallback;
}

/** Reads `LOADTEST_*` variables. Invalid values throw instead of silently running a wrong test. */
export function readConfig(env: Record<string, string | undefined>): LoadTestConfig {
  const config: LoadTestConfig = {
    apiUrl: text(env, 'LOADTEST_API_URL', DEFAULTS.apiUrl).replace(/\/+$/, ''),
    redisUrl: text(env, 'LOADTEST_REDIS_URL', env['REDIS_URL'] ?? DEFAULTS.redisUrl),
    clients: positiveInt(env, 'LOADTEST_CLIENTS', DEFAULTS.clients),
    users: positiveInt(env, 'LOADTEST_USERS', DEFAULTS.users),
    eventsPerSecond: positiveInt(env, 'LOADTEST_EVENTS_PER_SECOND', DEFAULTS.eventsPerSecond),
    durationSeconds: positiveInt(env, 'LOADTEST_DURATION_SECONDS', DEFAULTS.durationSeconds),
    rampBatchSize: positiveInt(env, 'LOADTEST_RAMP_BATCH', DEFAULTS.rampBatchSize),
    rampDelayMs: positiveInt(env, 'LOADTEST_RAMP_DELAY_MS', DEFAULTS.rampDelayMs),
    ackEveryNth: positiveInt(env, 'LOADTEST_ACK_EVERY', DEFAULTS.ackEveryNth),
    seed: positiveInt(env, 'LOADTEST_SEED', DEFAULTS.seed),
    reportPath: env['LOADTEST_REPORT']?.trim() || null,
  };
  if (config.users > config.clients) {
    throw new Error('LOADTEST_USERS cannot exceed LOADTEST_CLIENTS');
  }
  return config;
}
