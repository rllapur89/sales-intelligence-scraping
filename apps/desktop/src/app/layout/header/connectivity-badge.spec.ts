import { connectivityBadge } from './connectivity-badge';

describe('connectivityBadge', () => {
  it('mock mode is always grey "Mock"', () => {
    expect(connectivityBadge('mock', true, 'disconnected')).toEqual({ label: 'Mock', tone: 'grey', pulse: false });
    expect(connectivityBadge('mock', false, 'connected').label).toBe('Mock');
  });

  it('live + connected + online is green "Live"', () => {
    expect(connectivityBadge('live', true, 'connected')).toEqual({ label: 'Live', tone: 'green', pulse: true });
  });

  it('live + connecting/reconnecting is amber "Reconnecting"', () => {
    expect(connectivityBadge('live', true, 'connecting').tone).toBe('amber');
    expect(connectivityBadge('live', true, 'reconnecting').label).toBe('Reconnecting');
  });

  it('no network is red "Offline" whatever the socket says', () => {
    expect(connectivityBadge('live', false, 'connected')).toEqual({ label: 'Offline', tone: 'red', pulse: false });
    expect(connectivityBadge('live', false, 'reconnecting').label).toBe('Offline');
  });

  it('disconnected and unauthorized sockets are red "Offline"', () => {
    expect(connectivityBadge('live', true, 'disconnected').label).toBe('Offline');
    expect(connectivityBadge('live', true, 'unauthorized').tone).toBe('red');
  });
});
