import { describe, expect, it } from 'vitest';
import { DEFAULT_MOCK_ROWS, MAX_MOCK_ROWS, parseRowCount } from './row-count';

describe('parseRowCount', () => {
  it('returns the default without a query string or parameter', () => {
    expect(parseRowCount(undefined)).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('')).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('?other=5')).toBe(DEFAULT_MOCK_ROWS);
  });

  it('reads a valid row count', () => {
    expect(parseRowCount('?rows=50000')).toBe(50_000);
    expect(parseRowCount('?a=1&rows=300')).toBe(300);
  });

  it('ignores values that are not positive integers', () => {
    expect(parseRowCount('?rows=abc')).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('?rows=-4')).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('?rows=1.5')).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('?rows=0')).toBe(DEFAULT_MOCK_ROWS);
    expect(parseRowCount('?rows=')).toBe(DEFAULT_MOCK_ROWS);
  });

  it('caps the count', () => {
    expect(parseRowCount('?rows=9999999')).toBe(MAX_MOCK_ROWS);
  });

  it('accepts a custom fallback', () => {
    expect(parseRowCount(undefined, 10)).toBe(10);
  });
});
