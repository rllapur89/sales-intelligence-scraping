# Grid benchmark

Measures the leads grid (CDK virtual scroll) while it scrolls continuously: frames per second, frame
time percentiles, dropped frames and JS heap, for a baseline list and a 50,000 row list.

The mock data source reads `?rows=N` (capped at 200,000), so no backend is needed:

```
http://localhost:4200/leads?rows=50000
```

## Run it

Playwright is an optional dependency and is not installed by the workspace (Chromium is a large
download). Install it yourself once:

```bash
npm i -D playwright-core -w @leads/grid-benchmark
npx playwright install chromium

npm run start -w @leads/desktop          # mock mode, http://localhost:4200
npm run build -w @leads/grid-benchmark
npm start -w @leads/grid-benchmark -- --rows 1200,50000 --duration 10 --report docs/grid-report.md
```

| Flag         | Default                       | Meaning                               |
| ------------ | ----------------------------- | ------------------------------------- |
| `--url`      | `http://localhost:4200/leads` | Page with the grid                    |
| `--rows`     | `1200,50000`                  | Row counts, first one is the baseline |
| `--duration` | `10`                          | Seconds of scrolling per scenario     |
| `--step`     | `40`                          | Pixels scrolled per animation frame   |
| `--report`   | unset                         | Markdown output path                  |
| `--headed`   | headless                      | Show the browser window               |

## How it measures

`scrollRun` scrolls the viewport by `--step` pixels on every `requestAnimationFrame`, bouncing at both
ends, and records each frame timestamp. `frameStats` turns the timestamps into FPS and nearest-rank
percentiles. A frame slower than 33.4 ms (two 60 Hz budgets) counts as dropped. The heap is read from
`performance.memory` (Chromium started with `--enable-precise-memory-info`) before and after.

## Limits

- Mock rows are generated in memory, so this isolates rendering and the NgRx store. It does not include
  the REST snapshot or live updates.
- Headless Chromium without a GPU can be slower than a real desktop. Compare scenarios from the same
  run, not across machines.
- `performance.memory` is Chromium-only.
