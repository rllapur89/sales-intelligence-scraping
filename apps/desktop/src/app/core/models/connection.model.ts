/** State of the Socket.IO connection (also mirrored into the leads store). */
export type RealtimeStatus =
  | 'connecting'
  | 'connected'
  | 'reconnecting'
  | 'disconnected'
  | 'unauthorized';
