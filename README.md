# Connectist — Intelligent Sales

> Angular 21 + Electron desktop app for sales intelligence with deep web scraping simulation. Built to demonstrate enterprise-grade Angular architecture patterns.

---

## Overview

A full-featured **Sales Intelligence platform** that simulates deep web scraping, lead management, CRM pipeline, and analytics. All data is procedurally generated — no backend required. The app runs both as a web SPA and as a native desktop application via Electron.

---

## Tech Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Framework | Angular (standalone) | 21.2 |
| State | NgRx (actions + reducers + effects + selectors) | 21.1 |
| Entity | @ngrx/entity (EntityAdapter) | 21.1 |
| Virtual Scrolling | @angular/cdk/scrolling | 21.x |
| Desktop | Electron | 28.x |
| Styling | Tailwind CSS | 4.x |
| Reactivity | RxJS | 7.8 |
| Language | TypeScript | 5.9 |
| Charts | Inline SVG (no library) | — |

---

## Project Structure

```
leads-sales-intelligence/
├── electron/
│   ├── main.cjs              # Electron main process — BrowserWindow, tray, IPC, memory monitor
│   └── preload.cjs           # contextBridge API exposed to Angular (electronAPI)
├── src/
│   ├── app/
│   │   ├── core/
│   │   │   ├── models/
│   │   │   │   ├── lead.model.ts           # Lead, LeadFilter, BulkSelection (inverted pattern)
│   │   │   │   ├── scraping-job.model.ts   # ScrapingJob, JobStatus, ScrapingSource
│   │   │   │   ├── metrics.model.ts        # DashboardMetrics, ChartPoint, ActivityEvent
│   │   │   │   └── view-state.model.ts     # Discriminated union: idle|loading|loaded|refreshing|error|empty
│   │   │   ├── services/
│   │   │   │   ├── mock-data.service.ts    # 1200 leads + 24 jobs — procedural generation
│   │   │   │   └── connectivity.service.ts # navigator.onLine + online/offline events
│   │   │   └── store/
│   │   │       ├── leads/
│   │   │       │   ├── leads.actions.ts    # createActionGroup — 14 typed events
│   │   │       │   ├── leads.state.ts      # EntityState<Lead> + leadsAdapter
│   │   │       │   ├── leads.reducer.ts    # Pure reducer — upsert, filter, selection
│   │   │       │   ├── leads.selectors.ts  # selectFilteredLeads (memoized), selectBulkSelection
│   │   │       │   └── leads.effects.ts    # loadLeads, exportLeads (exhaustMap), refreshLead
│   │   │       ├── scraping/
│   │   │       │   ├── scraping.actions.ts # createActionGroup — 11 typed events
│   │   │       │   ├── scraping.state.ts   # EntityState<ScrapingJob> + scrapingAdapter
│   │   │       │   ├── scraping.reducer.ts # Jobs reducer — start, cancel, retry, progress
│   │   │       │   ├── scraping.selectors.ts # selectActiveJobs, selectJobSuccessRate
│   │   │       │   └── scraping.effects.ts # simulateJobProgress — interval(1200) real-time
│   │   │       └── app.state.ts            # AppState { leads, scraping }
│   │   ├── layout/
│   │   │   ├── shell/shell.component.ts    # Root layout — dispatches loadLeads + loadJobs on init
│   │   │   ├── sidebar/sidebar.component.ts # Collapsible nav — collapsed = signal(false)
│   │   │   └── header/header.component.ts  # Global search + connectivity badge + user avatar
│   │   ├── features/
│   │   │   ├── dashboard/dashboard.component.ts   # KPIs, SVG charts, activity feed (3s interval)
│   │   │   ├── leads/leads.component.ts           # CDK virtual scroll, bulk selection, detail sidebar
│   │   │   ├── scraping/scraping.component.ts     # Job monitor, progress bars, new job modal
│   │   │   ├── pipeline/pipeline.component.ts     # Kanban — 5 stages, move stage actions
│   │   │   └── reports/reports.component.ts       # SVG line/donut/bar charts, CSV export
│   │   ├── shared/
│   │   │   ├── components/
│   │   │   │   └── status-badge/status-badge.component.ts
│   │   │   └── pipes/
│   │   │       └── relative-time.pipe.ts   # "hace 5 min", "2 hours ago"
│   │   ├── app.routes.ts     # Lazy loading — loadComponent() for all 5 features
│   │   ├── app.config.ts     # provideStore + provideEffects + withHashLocation
│   │   └── app.ts            # Root component — just <router-outlet>
│   ├── styles.css            # Shimmer animation, custom scrollbar, Tailwind base
│   └── index.html            # Inter + JetBrains Mono fonts
├── angular.json              # outputMode: static, prerender: false (no SSR — Electron compat)
└── package.json
```

---

## NgRx Store Architecture

### AppState

```typescript
interface AppState {
  leads: LeadsState;
  scraping: ScrapingState;
}
```

### LeadsState

Built on `@ngrx/entity` for O(1) lookups and normalized storage:

```typescript
interface LeadsState extends EntityState<Lead> {
  // EntityState provides: ids: string[], entities: Dictionary<Lead>
  filter: LeadFilter;
  selectedLeadId: string | null;
  bulkSelection: { mode: 'include' | 'exclude'; ids: string[] };
  viewState: ViewState<Lead[]>;
  loading: boolean;
}
```

**Key selectors:**

| Selector | Description |
|----------|-------------|
| `selectAllLeads` | All leads from EntityAdapter |
| `selectFilteredLeads` | Memoized — applies all active filters |
| `selectSelectedLead` | Full Lead entity for detail sidebar |
| `selectLeadsLoading` | Boolean loading flag |
| `selectBulkSelection` | Current inverted selection state |
| `selectSelectedCount` | Computed count from inverted selection mode |

**Key effects:**

| Effect | RxJS pattern | Description |
|--------|-------------|-------------|
| `loadLeads$` | `switchMap` | Loads 1200 leads from MockDataService (600ms delay) |
| `exportLeads$` | `exhaustMap` | Prevents duplicate exports — ignores clicks while running |
| `refreshScrapingLead$` | `switchMap` | Cancels previous refresh if new one dispatched |

### ScrapingState

```typescript
interface ScrapingState extends EntityState<ScrapingJob> {
  activeTab: 'active' | 'completed' | 'failed';
  loading: boolean;
  simulationRunning: boolean;
}
```

**Key selectors:**

| Selector | Description |
|----------|-------------|
| `selectActiveJobs` | Jobs with status `running` or `queued` |
| `selectCompletedJobs` | Jobs with status `completed` |
| `selectFailedJobs` | Jobs with status `failed` |
| `selectTotalLeadsFound` | Sum of `leadsFound` across all jobs |
| `selectJobSuccessRate` | `(completed / (completed + failed)) * 100` |

**Key effects:**

| Effect | RxJS pattern | Description |
|--------|-------------|-------------|
| `loadJobs$` | `switchMap` | Loads 24 jobs from MockDataService |
| `simulateJobProgress$` | `interval(1200) + withLatestFrom` | Simulates SignalR real-time updates |
| `startJob$` | `switchMap` | Creates new job + starts simulation |

---

## Data Flow

### Leads Load Cycle

```
ShellComponent.ngOnInit()
  → dispatch(LeadsActions.loadLeads())
  → loadLeads$ effect → timer(600ms) → MockDataService.getLeads()
  → dispatch(LeadsActions.loadLeadsSuccess({ leads }))
  → leadsAdapter.setAll(leads, state)
  → selectFilteredLeads recomputes
  → leads.component.ts CDK virtual scroll renders
```

### Search with Debounce

```
header.component.ts: Subject<string>
  → debounceTime(300)
  → distinctUntilChanged()
  → takeUntilDestroyed()
  → dispatch(LeadsActions.setFilter({ filter: { search } }))
  → selectFilteredLeads recomputes (memoized — only if filter ref changed)
  → Virtual scroll re-renders visible rows only
```

### Scraping Real-Time Simulation

```
simulateJobProgress$ effect:
  interval(1200ms)
  → withLatestFrom(selectActiveJobs)
  → MockDataService.updateJobProgress(job) × each active job
  → dispatch(ScrapingActions.updateJobProgress({ jobs }))
  → scrapingAdapter.upsertMany(jobs, state)  ← idempotent
  → selectActiveJobs, selectTotalLeadsFound recompute
  → Progress bars animate via [style.width]="job.progress + '%'"
```

---

## ViewState Discriminated Union

All async operations use this pattern instead of `isLoading + error + data` booleans:

```typescript
type ViewState<T> =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: T; lastUpdated: Date }
  | { status: 'refreshing'; data: T }
  | { status: 'error'; error: string; retryable: boolean }
  | { status: 'empty'; message: string };
```

In templates:
```html
@switch (viewState().status) {
  @case ('loading') { <app-skeleton /> }
  @case ('loaded') { <div>{{ viewState().data.length }} items</div> }
  @case ('error') { <button (click)="retry()">Retry</button> }
}
```

---

## Inverted Bulk Selection

Supports "select all 1,200 leads" without storing 1,200 IDs in memory:

```typescript
interface BulkSelection {
  mode: 'include' | 'exclude';
  ids: string[];     // IDs that are the EXCEPTION to the mode
}

// "Select All" → mode: 'exclude', ids: []  (0 exceptions)
// Deselect one → mode: 'exclude', ids: [deselectedId]
// Select subset → mode: 'include', ids: [id1, id2, id3]
```

Computing selected count:
```typescript
const count = mode === 'include'
  ? ids.length
  : totalLeads - ids.length;
```

---

## CDK Virtual Scrolling

The leads table renders 1,200+ leads with O(1) DOM nodes:

```html
<cdk-virtual-scroll-viewport itemSize="56" class="h-full">
  <div *cdkVirtualFor="let lead of filteredLeads(); trackBy: trackByLeadId"
       class="h-14 flex items-center ...">
    <!-- Only ~15-20 rows in DOM at any time -->
  </div>
</cdk-virtual-scroll-viewport>
```

- `itemSize="56"` — each row is 56px height (h-14 in Tailwind)
- `trackBy` — prevents re-creation on data updates
- `scrolledIndexChange` — used for "load more" patterns

---

## Electron Integration

### Security Model

```
Angular (Renderer) ──── contextBridge ──── Main Process
     window.electronAPI                      Node.js APIs
```

- `nodeIntegration: false` — renderer has no direct Node access
- `contextIsolation: true` — renderer context isolated from preload
- `contextBridge.exposeInMainWorld` — explicit, typed API surface

### Preload API (window.electronAPI)

| Method | IPC Channel | Description |
|--------|-------------|-------------|
| `exportToFile(data, filename)` | `export-to-file` | Native save dialog |
| `getMemoryUsage()` | `get-memory-usage` | process.memoryUsage() from main |
| `onMemoryWarning(cb)` | `memory-warning` | Listener — main fires at >512MB |
| `offMemoryWarning(cb)` | `memory-warning` | Cleanup listener |
| `showSaveDialog(options)` | `show-save-dialog` | dialog.showSaveDialog |
| `getAppVersion()` | `get-app-version` | app.getVersion() |
| `platform` | (sync) | `process.platform` |

### Memory Monitoring

Electron main process checks memory every 30 seconds:
```javascript
// main.cjs
setInterval(() => {
  const { heapUsed } = process.memoryUsage();
  if (heapUsed > 512 * 1024 * 1024) {
    mainWindow.webContents.send('memory-warning', { heapUsed });
  }
}, 30000);
```

Angular header component listens and displays a warning badge.

---

## Features

### Dashboard
- 4 KPI cards: Total Leads, Active Jobs, Success Rate, Leads Today
- SVG bar chart — hourly scraping activity (last 24h)
- SVG donut chart — lead distribution by industry
- Real-time activity feed — updates every 3 seconds via `interval(3000)`
- System health bar — memory usage (via Electron IPC or mock)
- Top 3 active jobs monitor with progress indicators

### Leads Table
- **1,200+ leads** rendered via CDK Virtual Scroll (O(1) DOM nodes)
- Multi-column filter panel: industry, country, company size, score range, status
- Global search with `debounceTime(300) + distinctUntilChanged()`
- Inverted bulk selection — "Select All" stores 0 IDs
- Bulk action toolbar: Export, Enrich, Tag, Delete (with count display)
- Inline detail sidebar — no page navigation, click row to expand

### Scraping Monitor
- Three tabs: Active / Completed / Failed (Dead Letter Queue)
- Animated progress bars with shimmer effect for running jobs
- Real-time lead count updates every 1.2 seconds (interval simulation)
- New Job modal: name, source (6 options), target URL, scraping depth slider
- Cancel (active), Retry (failed) actions

### Pipeline (Kanban)
- 5 stages: New Lead → Contacted → Qualified → Proposal → Won
- Per-column: lead count badge + total $ value
- Lead cards: avatar initials, name, company, score pill, estimated value
- Move stage buttons (← Back / Next →) appear on hover
- Pipeline total value in header

### Reports & Analytics
- SVG line chart with fill area — leads generated per day (30 days)
- SVG donut chart — industry distribution with legend
- SVG horizontal bar chart — top 10 companies by lead count
- Success rate breakdown by scraping source
- Export to CSV — generates Blob + `<a download>` trigger

---

## Architectural Patterns Demonstrated

| Pattern | Where | Code |
|---------|-------|------|
| Virtual Scrolling | Leads feature | `<cdk-virtual-scroll-viewport itemSize="56">` |
| OnPush Everywhere | All components | `changeDetection: ChangeDetectionStrategy.OnPush` |
| Discriminated Union ViewState | All effects | `ViewState<T>` with `@switch` |
| Inverted Bulk Selection | Leads store | `{ mode: 'include'|'exclude', ids: string[] }` |
| Signals + toSignal | All components | `toSignal(store.select(...), { initialValue: ... })` |
| switchMap (cancellable) | loadLeads, refreshLead | Cancels in-flight when new action dispatched |
| exhaustMap (deduplicate) | exportLeads | Ignores clicks while export running |
| bufferTime / interval | ScrapingEffects | `interval(1200)` batches job progress updates |
| Facade Pattern | NgRx store | Components only interact with store, never services |
| Offline Detection | ConnectivityService | `navigator.onLine` + events → `shareReplay(1)` |
| Electron contextBridge | preload.cjs | Typed IPC API surface — zero Node in renderer |
| Memory Monitoring | electron/main.cjs | 30s interval → IPC → Angular warning badge |
| Lazy Loading Routes | app.routes.ts | `loadComponent()` for all 5 feature modules |
| Entity Adapter | @ngrx/entity | `upsertMany` idempotency, O(1) lookup by ID |
| Skeleton Loading | Leads, Scraping | `@if (loading()) { animate-pulse divs }` |

---

## Getting Started

### Prerequisites

```bash
node >= 20
npm >= 10
```

### Install

```bash
cd leads-sales-intelligence
npm install
```

### Run (Web)

```bash
npm start
# Opens http://localhost:4200
```

### Run (Electron)

```bash
npm run electron:dev
# Builds Angular then opens Electron window
```

### Build

```bash
npm run build           # Production web build
npm run electron:build  # Electron-optimized build (outputHashing: none)
```

---

## Scripts

| Script | Description |
|--------|-------------|
| `npm start` | Angular dev server on :4200 |
| `npm run build` | Production build to `dist/` |
| `npm test` | Vitest unit tests |
| `npm run electron:dev` | Build + launch Electron |
| `npm run electron:build` | Electron-optimized production build |

---

## Key Design Decisions

### Why NgRx over plain Signals?
NgRx was explicitly chosen for this project. It enforces unidirectional data flow via actions, centralizes side effects in effects (testable in isolation), provides `@ngrx/entity` for normalized state (critical for 1200+ leads), and enables Redux DevTools time-travel debugging — all patterns relevant at enterprise scale.

### Why @ngrx/entity?
The `EntityAdapter` gives us O(1) lead lookup by ID (`entities[id]`), ordered IDs array for virtual scroll rendering, and idempotent `upsertMany` for real-time updates without duplicates.

### Why CDK Virtual Scroll instead of ag-Grid / TanStack?
Zero external dependency, Angular-native, and directly demonstrates the `@angular/cdk` knowledge expected in Angular architect interviews. ag-Grid is a black box; CDK virtual scroll is transparent architecture.

### Why outputMode: "static" + no SSR?
This is an Electron app — there is no server. Angular's SSR (`@angular/ssr`) conflicts with Electron because:
1. SSR tries to render routes in Node.js during build (prerendering)
2. `ConnectivityService` uses `window.navigator.onLine` — browser-only API, crashes in Node
3. Electron loads `file://` URLs — hash routing (`withHashLocation()`) required

### Why withHashLocation()?
Electron uses `file://` protocol. Angular's `PathLocationStrategy` uses HTML5 `pushState` which requires a real web server to handle deep links. `HashLocationStrategy` (`withHashLocation()`) embeds routes as `file:///index.html#/dashboard` — works natively with `file://`.

### Why inline SVG charts?
No charting library dependency means zero bundle overhead, full control over animations, and demonstrates ability to compute SVG paths mathematically — a skill that impresses in technical interviews. All charts use `viewBox="0 0 400 200"` with computed `d` attributes from signal-derived data.

---

## Mock Data

**1,200 leads** generated with realistic distributions:
- 30 first names × 28 last names pool
- 30 companies across 12 industries
- 12 countries, 6 cities
- 14 roles / 5 seniority levels
- Score: 40–100 (random)
- Status distributed across: new, contacted, qualified, proposal, won, lost
- Tech stack: 1–4 technologies from pool of 15

**24 scraping jobs** with weighted status distribution:
- `running` × 2, `completed` × 2, `queued` × 1, `failed` × 1 (per 6 generated)
- Running jobs: progress 5–95%, continuing via `interval(1200)` effect
- Completed: progress = 100%, has `completedAt`

Real-time simulation:
- `simulateJobProgress$` effect fires every 1.2 seconds
- Each tick: progress +1–8%, leadsFound +5–80, errorCount +0/1 (10% chance)
- Job auto-completes when progress reaches 100%
