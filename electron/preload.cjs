const { contextBridge, ipcRenderer } = require('electron');

/**
 * Secure contextBridge — expone APIs de Electron al Renderer (Angular)
 * sin exponer Node.js directamente. Patrón del interview: contextIsolation: true
 */
contextBridge.exposeInMainWorld('electronAPI', {
  // Export leads to filesystem via native dialog
  exportToFile: (data, filename) =>
    ipcRenderer.invoke('export-to-file', data, filename),

  // Get system memory usage for health monitor
  getMemoryUsage: () =>
    ipcRenderer.invoke('get-memory-usage'),

  // Listen for memory warnings from main process
  onMemoryWarning: (callback) =>
    ipcRenderer.on('memory-warning', (_event, info) => callback(info)),

  // Remove memory warning listener
  offMemoryWarning: () =>
    ipcRenderer.removeAllListeners('memory-warning'),

  // Show native save dialog
  showSaveDialog: (options) =>
    ipcRenderer.invoke('show-save-dialog', options),

  // App info
  getAppVersion: () =>
    ipcRenderer.invoke('get-app-version'),

  // Platform info
  platform: process.platform,
});
