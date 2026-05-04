import { RelativeTimePipe } from './relative-time.pipe';

describe('RelativeTimePipe', () => {
  let pipe: RelativeTimePipe;
  const now = new Date('2024-06-01T12:00:00Z');

  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(now);
    pipe = new RelativeTimePipe();
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  it('returns empty string for null', () => {
    expect(pipe.transform(null)).toBe('');
  });

  it('returns empty string for undefined', () => {
    expect(pipe.transform(undefined)).toBe('');
  });

  it('returns "just now" for less than 60 seconds ago', () => {
    const date = new Date(now.getTime() - 30_000);
    expect(pipe.transform(date)).toBe('just now');
  });

  it('returns "just now" at exactly 59 seconds ago', () => {
    const date = new Date(now.getTime() - 59_000);
    expect(pipe.transform(date)).toBe('just now');
  });

  it('returns minutes ago', () => {
    const date = new Date(now.getTime() - 5 * 60_000);
    expect(pipe.transform(date)).toBe('5m ago');
  });

  it('returns "1m ago" at exactly 60 seconds ago', () => {
    const date = new Date(now.getTime() - 60_000);
    expect(pipe.transform(date)).toBe('1m ago');
  });

  it('returns hours ago', () => {
    const date = new Date(now.getTime() - 3 * 3_600_000);
    expect(pipe.transform(date)).toBe('3h ago');
  });

  it('returns days ago', () => {
    const date = new Date(now.getTime() - 2 * 86_400_000);
    expect(pipe.transform(date)).toBe('2d ago');
  });

  it('accepts ISO string input', () => {
    const date = new Date(now.getTime() - 10 * 60_000).toISOString();
    expect(pipe.transform(date)).toBe('10m ago');
  });
});
