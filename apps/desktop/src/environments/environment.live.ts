import type { Environment } from './environment.model';

/** Live environment (`--configuration live`): REST + Socket.IO against the local API. */
export const environment: Environment = {
  dataMode: 'live',
  apiUrl: 'http://localhost:3000/api',
  socketUrl: 'http://localhost:3000',
  // Seeded demo user (packages/db/prisma/seed.ts); local development only.
  demoUser: { email: 'sales@demo.local', password: 'demo1234' },
  snapshotMaxLeads: 20_000,
  snapshotMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  snapshotSaveDebounceMs: 5000,
  snapshotPageSize: 200,
  ackSampleRate: 0.1,
  ackMaxPerEmit: 100,
  jobsPollMs: 5000,
};
