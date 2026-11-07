import type { Environment } from './environment.model';

/** Default environment: mock mode, runs without any backend. */
export const environment: Environment = {
  dataMode: 'mock',
  apiUrl: '',
  socketUrl: '',
  demoUser: { email: '', password: '' },
  snapshotMaxLeads: 20_000,
  snapshotPageSize: 200,
  ackSampleRate: 0.1,
  ackMaxPerEmit: 100,
  jobsPollMs: 5000,
};
