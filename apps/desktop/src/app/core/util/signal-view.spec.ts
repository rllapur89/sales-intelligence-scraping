import type { SignalDto } from '@leads/shared';
import { recentSignalViews, safeHttpUrl, toSignalView } from './signal-view';

const signal = (over: Partial<SignalDto> & Pick<SignalDto, 'type'>): SignalDto => ({
  id: 's1',
  companyId: 'c1',
  source: 'greenhouse',
  payload: {},
  detectedAt: '2026-06-01T00:00:00.000Z',
  scrapedAt: '2026-06-01T00:00:00.000Z',
  ...over,
});

describe('toSignalView', () => {
  it('shows the job title and the "via" attribution of a RemoteOK signal', () => {
    const view = toSignalView(
      signal({
        type: 'hiring',
        source: 'remoteok',
        payload: {
          title: 'Senior Engineer',
          url: 'https://remoteok.com/remote-jobs/1',
          attribution: { name: 'Remote OK', url: 'https://remoteok.com/remote-jobs/1' },
        },
      })
    );
    expect(view.title).toBe('Senior Engineer');
    expect(view.attribution).toEqual({ name: 'Remote OK', url: 'https://remoteok.com/remote-jobs/1' });
    expect(view.url).toBe('https://remoteok.com/remote-jobs/1');
    expect(view.date).toBe('2026-06-01T00:00:00.000Z');
  });

  it('has no attribution when the payload has none or it is malformed', () => {
    expect(toSignalView(signal({ type: 'hiring', payload: { title: 'x' } })).attribution).toBeNull();
    for (const attribution of [null, 'Remote OK', [], { name: 'Remote OK' }, { url: 'https://a.io' }]) {
      expect(toSignalView(signal({ type: 'hiring', payload: { attribution } })).attribution).toBeNull();
    }
  });

  it('never links non-http(s) urls', () => {
    const view = toSignalView(
      signal({
        type: 'hiring',
        payload: { url: 'javascript:alert(1)', attribution: { name: 'X', url: 'javascript:alert(1)' } },
      })
    );
    expect(view.url).toBeNull();
    expect(view.attribution).toBeNull();
    expect(safeHttpUrl('ftp://a.io')).toBeNull();
    expect(safeHttpUrl('not a url')).toBeNull();
    expect(safeHttpUrl(42)).toBeNull();
    expect(safeHttpUrl('https://a.io/x')).toBe('https://a.io/x');
  });

  it('labels every signal type', () => {
    expect(toSignalView(signal({ type: 'filing', payload: { form: '8-K' } })).title).toBe('SEC filing 8-K');
    expect(toSignalView(signal({ type: 'filing' })).title).toBe('SEC filing');
    expect(
      toSignalView(signal({ type: 'oss-activity', payload: { kind: 'new-repo', fullName: 'acme/x' } })).title
    ).toBe('New repo acme/x');
    expect(
      toSignalView(
        signal({ type: 'oss-activity', payload: { kind: 'release', repo: 'acme/x', tag: 'v1.2.0' } })
      ).title
    ).toBe('Release v1.2.0 (acme/x)');
    expect(toSignalView(signal({ type: 'website-tech', payload: { title: 'Acme Home' } })).title).toBe(
      'Acme Home'
    );
    expect(toSignalView(signal({ type: 'website-tech' })).title).toBe('Website technology detected');
    expect(toSignalView(signal({ type: 'funding' })).title).toBe('funding');
  });
});

describe('recentSignalViews', () => {
  it('sorts newest first and caps the list', () => {
    const list = [
      signal({ id: 'old', type: 'hiring', detectedAt: '2026-01-01T00:00:00.000Z' }),
      signal({ id: 'new', type: 'hiring', detectedAt: '2026-06-01T00:00:00.000Z' }),
      signal({ id: 'mid', type: 'hiring', detectedAt: '2026-03-01T00:00:00.000Z' }),
    ];
    expect(recentSignalViews(list).map(v => v.id)).toEqual(['new', 'mid', 'old']);
    expect(recentSignalViews(list, 2).map(v => v.id)).toEqual(['new', 'mid']);
    expect(recentSignalViews([])).toEqual([]);
  });
});
