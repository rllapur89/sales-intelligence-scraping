# Electron Desktop App — Design Spec
Date: 2026-04-30

## Goal

Wrap the existing Angular 21 leads-sales-intelligence app as a Windows installable desktop application using Electron. App runs 100% standalone with mock data (no backend required).

## Architecture

Electron loads the Angular CSR (Client-Side Rendering) build directly from disk via `file://` protocol. No Express server, no SSR, no ports. The existing web build (with SSR) is preserved and continues to work independently.

```
leads-sales-intelligence/
├── electron/
│   └── main.js              ← Electron main process
├── src/                     ← Angular app (no changes)
├── dist/
│   └── leads-sales-intelligence/
│       └── browser/         ← Electron loads index.html from here
├── release/                 ← electron-builder output (gitignored)
└── package.json
```

## Angular Build Configuration

A new `electron` configuration added to `angular.json` under `architect.build.configurations`. Uses `outputMode: "client"` to disable SSR for this target. The default `production` build (with SSR) is untouched.

## Electron Main Process (electron/main.js)

- Creates `BrowserWindow` at 1280×800
- Loads `dist/leads-sales-intelligence/browser/index.html` via `file://`
- Security defaults: `contextIsolation: true`, `nodeIntegration: false`
- No `webSecurity: false` — not needed since app uses no external APIs

## package.json Scripts

| Script | Purpose |
|--------|---------|
| `build:electron` | `ng build --configuration=electron` |
| `electron:dev` | Build then launch Electron locally |
| `electron:dist` | Build then package as Windows NSIS installer |

## electron-builder Configuration

- **Target**: `nsis` (Windows standard installer)
- **AppId**: `com.connectist.leads-sales-intelligence`
- **Output**: `release/` directory
- **Files**: `dist/` + `electron/` + `package.json`

## Constraints

- Windows only (no Mac/Linux targets)
- 100% standalone — no backend, no network calls
- Mock data only (LeadDataService with simulated scraping)
- No changes to existing Angular source code
