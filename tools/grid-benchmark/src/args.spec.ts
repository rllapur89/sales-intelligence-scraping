import { describe, expect, it } from 'vitest';
import { DEFAULT_ARGS, parseArgs, scenarioUrl } from './args';

describe('parseArgs', () => {
  it('returns the defaults without arguments and does not share the rows array', () => {
    const a = parseArgs([]);
    expect(a).toEqual(DEFAULT_ARGS);
    a.rows.push(1);
    expect(DEFAULT_ARGS.rows).toEqual([1200, 50000]);
  });

  it('parses every flag', () => {
    const a = parseArgs([
      '--url',
      'http://x/leads',
      '--rows',
      '100, 2000',
      '--duration',
      '5',
      '--step',
      '20',
      '--report',
      'out.md',
      '--headed',
    ]);
    expect(a).toEqual({
      url: 'http://x/leads',
      rows: [100, 2000],
      durationMs: 5000,
      stepPx: 20,
      reportPath: 'out.md',
      headless: false,
    });
  });

  it('rejects unknown flags, missing values and bad numbers', () => {
    expect(() => parseArgs(['--nope'])).toThrow('Unknown argument');
    expect(() => parseArgs(['--url'])).toThrow('needs a value');
    expect(() => parseArgs(['--rows', '10,abc'])).toThrow('--rows');
    expect(() => parseArgs(['--duration', '0'])).toThrow('--duration');
  });
});

describe('scenarioUrl', () => {
  it('sets or replaces the rows parameter and keeps the rest', () => {
    expect(scenarioUrl('http://h/leads', 50000)).toBe('http://h/leads?rows=50000');
    expect(scenarioUrl('http://h/leads?a=1&rows=5', 9)).toBe('http://h/leads?a=1&rows=9');
  });
});
