export interface ApiEnv {
  nodeEnv: string;
  port: number;
  databaseUrl: string;
  redisUrl: string;
  corsOrigin: string;
}

function required(raw: Record<string, unknown>, key: string): string {
  const value = raw[key];
  if (typeof value !== 'string' || value.trim() === '') {
    throw new Error(`Missing required environment variable ${key}`);
  }
  return value;
}

/** Validates raw process env once at boot so misconfiguration fails fast, not at first request. */
export function validateEnv(raw: Record<string, unknown>): ApiEnv {
  const portRaw = typeof raw['API_PORT'] === 'string' ? raw['API_PORT'] : '3000';
  const port = Number(portRaw);
  if (!Number.isInteger(port) || port < 1 || port > 65535) {
    throw new Error(`API_PORT must be an integer between 1 and 65535, got "${portRaw}"`);
  }
  return {
    nodeEnv: typeof raw['NODE_ENV'] === 'string' ? raw['NODE_ENV'] : 'development',
    port,
    databaseUrl: required(raw, 'DATABASE_URL'),
    redisUrl: required(raw, 'REDIS_URL'),
    corsOrigin:
      typeof raw['CORS_ORIGIN'] === 'string' ? raw['CORS_ORIGIN'] : 'http://localhost:4200',
  };
}
