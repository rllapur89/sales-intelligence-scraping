import type { DataMode } from '../../../environments/environment.model';
import { RealtimeStatus } from '../../core/models/connection.model';

export type BadgeTone = 'green' | 'amber' | 'red' | 'grey';

export interface ConnectivityBadge {
  label: 'Live' | 'Reconnecting' | 'Offline' | 'Mock';
  tone: BadgeTone;
  /** Pulse the dot while a connection is up or being re-established. */
  pulse: boolean;
}

/**
 * Header badge from `navigator.onLine` + the realtime status:
 * Mock (grey) without a backend, Offline (red) without network or socket, Reconnecting (amber)
 * while connecting, Live (green) when the socket is up.
 */
export function connectivityBadge(
  mode: DataMode,
  online: boolean,
  status: RealtimeStatus
): ConnectivityBadge {
  if (mode === 'mock') return { label: 'Mock', tone: 'grey', pulse: false };
  if (!online) return { label: 'Offline', tone: 'red', pulse: false };
  switch (status) {
    case 'connected':
      return { label: 'Live', tone: 'green', pulse: true };
    case 'connecting':
    case 'reconnecting':
      return { label: 'Reconnecting', tone: 'amber', pulse: true };
    case 'disconnected':
    case 'unauthorized':
      return { label: 'Offline', tone: 'red', pulse: false };
  }
}
