import { writeFileSync } from 'node:fs';
import { parseArgs, scenarioUrl } from './args';
import { frameStats } from './frame-stats';
import { renderBenchmark, type Scenario } from './report';
import { scrollRun, type ScrollResult } from './scroll-run';

/** Just what the runner needs from Playwright, so the package stays an optional dependency. */
interface PwPage {
  goto(url: string, opts?: { waitUntil?: string }): Promise<unknown>;
  waitForSelector(selector: string, opts?: { timeout?: number }): Promise<unknown>;
  addScriptTag(opts: { content: string }): Promise<unknown>;
  evaluate<R, A>(fn: (arg: A) => R | Promise<R>, arg: A): Promise<R>;
}
interface PwBrowser {
  newPage(): Promise<PwPage>;
  version(): string;
  close(): Promise<void>;
}
interface PwModule {
  chromium: {
    launch(opts: { headless: boolean; args: string[] }): Promise<PwBrowser>;
  };
}

const VIEWPORT = 'cdk-virtual-scroll-viewport';

async function loadPlaywright(): Promise<PwModule> {
  try {
    // A variable specifier keeps TypeScript and bundlers from requiring the optional package.
    const name = 'playwright-core';
    return (await import(name)) as PwModule;
  } catch {
    throw new Error(
      'playwright-core is not installed. Run `npm i -D playwright-core` and `npx playwright install chromium`, then retry.',
    );
  }
}

async function runScenario(
  browser: PwBrowser,
  url: string,
  durationMs: number,
  stepPx: number,
  rows: number,
): Promise<Scenario> {
  const page = await browser.newPage();
  await page.goto(url, { waitUntil: 'networkidle' });
  await page.waitForSelector(VIEWPORT, { timeout: 30_000 });
  await page.addScriptTag({ content: `window.__scrollRun = ${scrollRun.toString()};` });

  const result = await page.evaluate(
    async (cfg: {
      selector: string;
      durationMs: number;
      stepPx: number;
    }): Promise<ScrollResult> => {
      const w = window as unknown as {
        __scrollRun: typeof scrollRun;
        performance: Performance & { memory?: { usedJSHeapSize: number } };
      };
      const el = document.querySelector(cfg.selector) as HTMLElement;
      return w.__scrollRun(
        el,
        cfg.durationMs,
        cfg.stepPx,
        { raf: (cb) => requestAnimationFrame(cb), now: () => performance.now() },
        () => w.performance.memory?.usedJSHeapSize ?? null,
      );
    },
    { selector: VIEWPORT, durationMs, stepPx },
  );
  return {
    rows,
    stats: frameStats(result.timestamps),
    scrolledPx: result.scrolledPx,
    heapBefore: result.heapBefore,
    heapAfter: result.heapAfter,
  };
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const { chromium } = await loadPlaywright();
  // precise-memory-info makes performance.memory exact instead of bucketed.
  const browser = await chromium.launch({
    headless: args.headless,
    args: ['--enable-precise-memory-info'],
  });
  try {
    const scenarios: Scenario[] = [];
    for (const rows of args.rows) {
      console.log(`Scenario ${rows} rows ...`);
      scenarios.push(
        await runScenario(browser, scenarioUrl(args.url, rows), args.durationMs, args.stepPx, rows),
      );
    }
    const report = renderBenchmark(
      {
        startedAt: new Date().toISOString(),
        browser: `Chromium ${browser.version()}`,
        platform: `${process.platform} ${process.arch}`,
        url: args.url,
        durationMs: args.durationMs,
      },
      scenarios,
    );
    console.log(`\n${report}`);
    if (args.reportPath) writeFileSync(args.reportPath, report);
  } finally {
    await browser.close();
  }
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
