export interface ScrollEnv {
  raf: (cb: (ts: number) => void) => unknown;
  now: () => number;
}

export interface ScrollResult {
  timestamps: number[];
  scrolledPx: number;
  heapBefore: number | null;
  heapAfter: number | null;
}

/**
 * Scrolls `el` continuously for `durationMs` and records every animation frame timestamp.
 * It scrolls down by `stepPx` per frame and bounces back to the top at the end, so the run never
 * stops early on a short list. It must stay self-contained (no imports, no outer references): the
 * runner serializes it with `toString()` and executes it inside the page.
 */
export function scrollRun(
  el: { scrollTop: number; scrollHeight: number; clientHeight: number },
  durationMs: number,
  stepPx: number,
  env: ScrollEnv,
  heap: () => number | null,
): Promise<ScrollResult> {
  return new Promise((resolve) => {
    const timestamps: number[] = [];
    const heapBefore = heap();
    const started = env.now();
    let direction = 1;
    let scrolledPx = 0;

    const tick = (ts: number): void => {
      timestamps.push(ts);
      const max = el.scrollHeight - el.clientHeight;
      const before = el.scrollTop;
      let next = before + direction * stepPx;
      if (next >= max) {
        next = max;
        direction = -1;
      } else if (next <= 0) {
        next = 0;
        direction = 1;
      }
      el.scrollTop = next;
      scrolledPx += Math.abs(el.scrollTop - before);
      if (env.now() - started < durationMs) {
        env.raf(tick);
      } else {
        resolve({ timestamps, scrolledPx, heapBefore, heapAfter: heap() });
      }
    };
    env.raf(tick);
  });
}
