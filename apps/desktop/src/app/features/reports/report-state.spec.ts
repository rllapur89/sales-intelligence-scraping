import {
  describeError,
  isBreakdownEmpty,
  isFunnelEmpty,
  isSignalMixEmpty,
  isTrendEmpty,
} from './report-state';

describe('describeError', () => {
  it('explains network, auth and server failures without leaking the body', () => {
    expect(describeError({ status: 0, error: 'boom' })).toMatch(/Cannot reach the server/);
    expect(describeError({ status: 401 })).toMatch(/not authorised/);
    expect(describeError({ status: 403 })).toMatch(/not authorised/);
    expect(describeError({ status: 500, error: 'stack trace' })).toBe(
      'The server returned an error (500).',
    );
  });

  it('falls back to a generic message for anything else', () => {
    expect(describeError(new Error('x'))).toBe('Something went wrong while loading this report.');
    expect(describeError(null)).toBe('Something went wrong while loading this report.');
    expect(describeError('oops')).toBe('Something went wrong while loading this report.');
  });
});

describe('emptiness', () => {
  it('detects empty reports', () => {
    expect(isFunnelEmpty({ stages: [{ stage: 'new', count: 0, conversionFromPrevious: 0 }] })).toBe(
      true,
    );
    expect(
      isFunnelEmpty({ stages: [{ stage: 'new', count: 1, conversionFromPrevious: 100 }] }),
    ).toBe(false);
    expect(isBreakdownEmpty({ items: [] })).toBe(true);
    expect(isBreakdownEmpty({ items: [{ key: 'a', label: 'a', count: 1, avgScore: 1 }] })).toBe(
      false,
    );
    expect(isSignalMixEmpty({ items: [{ type: 'hiring', count: 0 }] })).toBe(true);
    expect(isSignalMixEmpty({ items: [{ type: 'hiring', count: 2 }] })).toBe(false);
    expect(
      isTrendEmpty({ days: 1, points: [{ date: '2025-01-01', newLeads: 0, avgScore: 0 }] }),
    ).toBe(true);
    expect(
      isTrendEmpty({ days: 1, points: [{ date: '2025-01-01', newLeads: 3, avgScore: 5 }] }),
    ).toBe(false);
  });
});
