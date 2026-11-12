export interface BenchArgs {
  url: string;
  /** Row counts to benchmark, in order; the first one is the baseline. */
  rows: number[];
  durationMs: number;
  stepPx: number;
  reportPath: string | null;
  headless: boolean;
}

export const DEFAULT_ARGS: BenchArgs = {
  url: 'http://localhost:4200/leads',
  rows: [1200, 50000],
  durationMs: 10_000,
  stepPx: 40,
  reportPath: null,
  headless: true,
};

function positive(name: string, value: string): number {
  const n = Number(value);
  if (!Number.isInteger(n) || n <= 0)
    throw new Error(`${name} must be a positive integer, got "${value}"`);
  return n;
}

/** Parses `--url`, `--rows 1200,50000`, `--duration 10`, `--step 40`, `--report path`, `--headed`. */
export function parseArgs(argv: readonly string[]): BenchArgs {
  const out: BenchArgs = { ...DEFAULT_ARGS, rows: [...DEFAULT_ARGS.rows] };
  for (let i = 0; i < argv.length; i++) {
    const flag = argv[i];
    const next = (): string => {
      const v = argv[++i];
      if (v === undefined) throw new Error(`${flag} needs a value`);
      return v;
    };
    switch (flag) {
      case '--url':
        out.url = next();
        break;
      case '--rows':
        out.rows = next()
          .split(',')
          .map((r) => positive('--rows', r.trim()));
        break;
      case '--duration':
        out.durationMs = positive('--duration', next()) * 1000;
        break;
      case '--step':
        out.stepPx = positive('--step', next());
        break;
      case '--report':
        out.reportPath = next();
        break;
      case '--headed':
        out.headless = false;
        break;
      default:
        throw new Error(`Unknown argument ${String(flag)}`);
    }
  }
  return out;
}

/** The URL of one scenario: the mock list size travels in `?rows=`. */
export function scenarioUrl(base: string, rows: number): string {
  const url = new URL(base);
  url.searchParams.set('rows', String(rows));
  return url.toString();
}
