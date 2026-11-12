import type { Environment } from './environment.model';

/** Default environment: mock mode, runs without any backend. */
export const environment: Environment = {
  dataMode: 'mock',
  apiUrl: '',
  socketUrl: '',
  demoUser: { email: '', password: '' },
  snapshotMaxLeads: 20_000,
  snapshotMaxAgeMs: 7 * 24 * 60 * 60 * 1000,
  snapshotSaveDebounceMs: 5000,
  snapshotPageSize: 200,
  ackSampleRate: 0.1,
  ackMaxPerEmit: 100,
  jobsPollMs: 5000,
};
