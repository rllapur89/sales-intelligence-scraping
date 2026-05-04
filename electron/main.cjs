const { app, BrowserWindow, ipcMain, dialog, Tray, Menu, nativeImage } = require('electron');
const path = require('path');
const os = require('os');
const fs = require('fs');

const MEMORY_WARNING_THRESHOLD_MB = 512;
let mainWindow = null;
let tray = null;

// ─── Window ──────────────────────────────────────────────────────────────────

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 900,
    minWidth: 1024,
    minHeight: 640,
    backgroundColor: '#020617',
    titleBarStyle: process.platform === 'darwin' ? 'hiddenInset' : 'default',
    webPreferences: {
      // Seguridad: contextIsolation + nodeIntegration false — patrón del interview
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
      preload: path.join(__dirname, 'preload.cjs'),
    },
  });

  mainWindow.loadFile(
    path.join(__dirname, '..', 'dist', 'electron', 'browser', 'index.html')
  );

  // Ocultar a system tray al cerrar (en lugar de quit)
  mainWindow.on('close', (event) => {
    if (!app.isQuitting) {
      event.preventDefault();
      mainWindow.hide();
    }
  });
}

// ─── System Tray ─────────────────────────────────────────────────────────────

function createTray() {
  // Usa un ícono vacío si no hay assets
  const icon = nativeImage.createEmpty();
  tray = new Tray(icon);

  const contextMenu = Menu.buildFromTemplate([
    { label: 'Connectist — Intelligent Sales', enabled: false },
    { type: 'separator' },
    { label: 'Open App', click: () => { mainWindow.show(); mainWindow.focus(); } },
    { type: 'separator' },
    { label: 'Quit', click: () => { app.isQuitting = true; app.quit(); } },
  ]);

  tray.setContextMenu(contextMenu);
  tray.setToolTip('Connectist Sales Intelligence');
  tray.on('double-click', () => { mainWindow.show(); mainWindow.focus(); });
}

// ─── Memory Monitoring (patrón del interview) ─────────────────────────────────

function startMemoryMonitoring() {
  setInterval(() => {
    const mem = process.memoryUsage();
    const heapUsedMb = Math.round(mem.heapUsed / 1024 / 1024);
    const heapTotalMb = Math.round(mem.heapTotal / 1024 / 1024);

    if (heapUsedMb > MEMORY_WARNING_THRESHOLD_MB && mainWindow && !mainWindow.isDestroyed()) {
      mainWindow.webContents.send('memory-warning', {
        heapUsedMb,
        heapTotalMb,
        threshold: MEMORY_WARNING_THRESHOLD_MB,
      });
    }
  }, 30_000); // Cada 30s
}

// ─── IPC Handlers ─────────────────────────────────────────────────────────────

ipcMain.handle('get-memory-usage', () => {
  const mem = process.memoryUsage();
  const total = os.totalmem();
  return {
    heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
    heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
    systemTotalMb: Math.round(total / 1024 / 1024),
    rss: Math.round(mem.rss / 1024 / 1024),
  };
});

ipcMain.handle('export-to-file', async (_event, data, filename) => {
  const { filePath } = await dialog.showSaveDialog(mainWindow, {
    defaultPath: filename ?? `leads-export-${Date.now()}.csv`,
    filters: [{ name: 'CSV Files', extensions: ['csv'] }],
  });
  if (!filePath) return { success: false, reason: 'cancelled' };
  fs.writeFileSync(filePath, data, 'utf-8');
  return { success: true, filePath };
});

ipcMain.handle('show-save-dialog', async (_event, options) => {
  return dialog.showSaveDialog(mainWindow, options);
});

ipcMain.handle('get-app-version', () => app.getVersion());

// ─── App lifecycle ─────────────────────────────────────────────────────────────

app.whenReady().then(() => {
  createWindow();
  createTray();
  startMemoryMonitoring();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
    else mainWindow.show();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('before-quit', () => { app.isQuitting = true; });
