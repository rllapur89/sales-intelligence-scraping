# TODO: what is left

Phases 1 to 6 are implemented in code. What remains is mostly **running** things that could not be run
when they were written (no Docker, no Chromium on the development host), plus a few known gaps. Rules
that still apply: no personal data, verify each source's terms before adding it, numbers in the README
must come from local runs of this project.

## Runs not done yet

- **Load test** (`tools/loadtest`): 1,000 clients, ~500 events/s. Paste the report in
  `docs/benchmarks.md`. The runner is unit-tested but was never run against a live API.
- **Grid benchmark** (`tools/grid-benchmark`): 1,200 vs 50,000 rows. Needs `playwright-core` and
  `npx playwright install chromium`. Never run.
- **Grafana dashboard** (`infra/grafana/dashboards/pipeline.json`): never loaded in Grafana; check the
  panel queries against a running API and workers.
- **Integration CI job**: added as advisory (`continue-on-error`) until it is green on GitHub Actions;
  then remove that flag.
- **Offline cache**: unit-tested with fakes; never run in a browser or an Electron window.
- **Worker presence** (`leads:workers:source:<source>`): unit-tested; never exercised against real Redis.

## Still to do

- **Electron memory leaks:** take heap snapshots, find and fix leaks, write the before/after in
  `docs/electron-memory.md`. Re-verify `electron-builder` packaging inside the npm workspace (hoisted
  `node_modules`).
- **Grid at 50,000+ rows:** confirm it stays smooth with the benchmark above.
- **Final README pass** with the measured numbers.

## Known gaps

- Several API instances behind one Redis were not tested (single instance only).
- The desktop initial bundle is 500.80 kB, 800 bytes over the 500 kB warning budget in `angular.json`.
- Postings that disappear from a board are not retired; scores decay by signal age.
- The offline cache cannot tell that cached data belongs to another user across an app restart (it is
  cleared on logout and on user change within a run).
- RemoteOK jobs rarely expose a company domain, so that source yields few leads.
- Hacker News "Who is hiring" is skipped by the owner's decision (terms unclear).
- Tickers in `apps/workers/config/companies.json` (`secTicker`) are unverified until a run with
  `SEC_EDGAR_USER_AGENT` set; the scraper skips a company whose EDGAR name does not match.

## Runs not done for the analytics, CRM and alerts features

- The `crm` and `notifications` migrations were never applied to a database; apply them on a dev database
  and compare with `prisma migrate diff`.
- The analytics raw SQL (`date_trunc` bucketing) and the `bySource` relation filter were only checked
  against mocks.
- Retraction and notifications were not tested with several API instances behind one Redis. The 24 h
  notification dedupe is read-then-insert, so a rare duplicate is possible.
- The bell, the CRM tabs and the reports page were tested as components, never in a browser or Electron.
- There is no user-list endpoint, so a lead can only be assigned to yourself or unassigned.

## Closed in phases 5 and 6

- Prometheus metrics in the API and the workers, Grafana dashboard (`docs/metrics.md`).
- Load test runner and grid benchmark tools, `docs/benchmarks.md` (no numbers yet).
- Offline snapshot cache (`docs/offline-cache.md`), ADRs (`docs/adr/`).
- `POST /api/jobs` answers 503 for a source with no running worker.
- One shared `LeadDto` mapper for the API and the workers (`packages/shared/src/lead-mapper.ts`).
- Lead retraction (`leads:retracted`), see ADR 0005.
- Integration tests run in CI against Postgres and Redis services (advisory for now).
