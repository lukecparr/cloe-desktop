'use strict';

/**
 * Lifecycle — system tray, application menu, and PATH repair.
 *
 * Extracted from launcher.js. These three routines are self-contained UI
 * helpers whose only external touchpoint is createManagerWindow() (from the
 * windows module), used by the tray and app-menu "Settings…" entries.
 *
 * The app.whenReady bootstrap sequence and app.on(...) event handlers stay in
 * launcher.js for now: they orchestrate startBridge/waitForBridge/createWindow,
 * which still live there (the HTTP route split is a later phase). Moving the
 * bootstrap here would create a circular dependency, so it is deferred until
 * the bridge/window internals are themselves modularised.
 */

const path = require('path');
const { app, Tray, Menu, nativeImage } = require('electron');
const { createManagerWindow } = require('./windows');

function createTray() {
  // Tray icon — dock icon (icon_1024.png) scaled to 70x70 and centred on an
  // 88x88 transparent canvas (≈80% scale with padding). Stored as a PNG asset
  // at build/tray-icon.png so it ships with every build and is easy to swap.
  // Loaded from disk (not inlined) for clarity; keepTemplate=false so the
  // original colours render identically on light and dark menu bars.
  const iconPath = path.join(__dirname, '..', '..', 'build', 'tray-icon.png');
  let trayIcon = nativeImage.createFromPath(iconPath);
  trayIcon = trayIcon.resize({ width: 22, height: 22 });

  const tray = new Tray(trayIcon);
  tray.setToolTip('Cloe Desktop');

  const contextMenu = Menu.buildFromTemplate([
    {
      label: 'Settings...',
      click: () => createManagerWindow(),
    },
    { type: 'separator' },
    {
      label: 'Quit Cloe',
      click: () => {
        app.quit();
      },
    },
  ]);

  tray.setContextMenu(contextMenu);
  return tray;
}

// ==================== Application Menu (macOS menu bar) ====================
function createAppMenu() {
  const template = [
    {
      label: app.name,
      submenu: [
        { role: 'about', label: `About ${app.name}` },
        { type: 'separator' },
        { label: 'Settings...', accelerator: 'Cmd+,', click: () => createManagerWindow() },
        { type: 'separator' },
        { role: 'services', label: 'Services' },
        { type: 'separator' },
        { role: 'hide', label: `Hide ${app.name}` },
        { role: 'hideOthers', label: 'Hide Others' },
        { role: 'unhide', label: 'Show All' },
        { type: 'separator' },
        { role: 'quit', label: `Quit ${app.name}` },
      ],
    },
    {
      label: 'Edit',
      submenu: [
        { role: 'undo', label: 'Undo' },
        { role: 'redo', label: 'Redo' },
        { type: 'separator' },
        { role: 'cut', label: 'Cut' },
        { role: 'copy', label: 'Copy' },
        { role: 'paste', label: 'Paste' },
        { role: 'selectAll', label: 'Select All' },
      ],
    },
    {
      label: 'View',
      submenu: [
        { role: 'reload', label: 'Reload' },
        { role: 'forceReload', label: 'Force Reload' },
        { role: 'toggleDevTools', label: 'Toggle Developer Tools' },
        { type: 'separator' },
        { role: 'resetZoom', label: 'Actual Size' },
        { role: 'zoomIn', label: 'Zoom In' },
        { role: 'zoomOut', label: 'Zoom Out' },
        { type: 'separator' },
        { role: 'togglefullscreen', label: 'Toggle Full Screen' },
      ],
    },
    {
      label: 'Window',
      submenu: [
        { role: 'minimize', label: 'Minimize' },
        { role: 'zoom', label: 'Zoom' },
        { type: 'separator' },
        { role: 'front', label: 'Bring All to Front' },
      ],
    },
  ];
  const menu = Menu.buildFromTemplate(template);
  Menu.setApplicationMenu(menu);
}

// ==================== PATH repair ====================

// Fix PATH for packaged app — macOS GUI apps get a minimal PATH from launchd,
// missing Homebrew, Hermes, and other shell-configured paths.
// Run a login shell to capture the full PATH and merge into process.env.
async function fixPath() {
  const { execSync } = require('child_process');
  try {
    const shellPath = process.env.SHELL || '/bin/zsh';
    const loginPath = execSync(`${shellPath} -l -c 'echo $PATH'`, {
      encoding: 'utf8',
      timeout: 5000,
    }).trim();
    if (loginPath) {
      const extra = loginPath.split(':').filter(p => !process.env.PATH.includes(p));
      if (extra.length > 0) {
        process.env.PATH = [...extra, process.env.PATH].join(':');
        console.log('[PATH] Enriched with', extra.length, 'entries from login shell');
      }
    }
  } catch (e) {
    console.warn('[PATH] Failed to enrich PATH from login shell:', e.message);
  }
}

module.exports = {
  createTray,
  createAppMenu,
  fixPath,
};
