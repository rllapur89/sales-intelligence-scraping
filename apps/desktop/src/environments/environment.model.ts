export type DataMode = 'mock' | 'live';

export interface Environment {
  /** `mock` runs without a backend; `live` talks to the REST API and the Socket.IO gateway. */
  dataMode: DataMode;
  apiUrl: string;
  socketUrl: string;
  /** Credentials of the seeded demo user, only used in live mode. */
  demoUser: { email: string; password: string };
  /** Maximum number of leads loaded by the initial REST snapshot. */
  snapshotMaxLeads: number;
  /** Maximum age of the offline snapshot cache before it is ignored, in milliseconds. */
  snapshotMaxAgeMs: number;
  /** Quiet period after the last live batch before the offline cache is saved, in milliseconds. */
  snapshotSaveDebounceMs: number;
  /** Page size of the snapshot keyset pagination (API maximum is 200). */
  snapshotPageSize: number;
  /** Fraction (0-1) of rendered leads reported back through `latency:ack`. */
  ackSampleRate: number;
  /** Upper bound of acks sent in one `latency:ack` emit. */
  ackMaxPerEmit: number;
  /** Polling interval of the live job list, in milliseconds. */
  jobsPollMs: number;
}
