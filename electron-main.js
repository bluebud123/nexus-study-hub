// ═══════════════════════════════════════════════════
//  Nexus — Electron Entry Point
//  Starts the Node server then opens the app window.
// ═══════════════════════════════════════════════════
const { app, BrowserWindow, shell, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

const PORT = 3456;
let win = null;
let server = null;

// ── Start the Nexus server ────────────────────────
function startServer() {
  const serverPath = path.join(__dirname, 'server.js');
  server = spawn(process.execPath, [serverPath], {
    env: { ...process.env, PORT: String(PORT) },
    stdio: 'inherit',
  });
  server.on('error', (err) => console.error('Server error:', err));
}

// ── Wait for server to be ready ───────────────────
function waitForServer(retries = 20) {
  return new Promise((resolve, reject) => {
    const attempt = () => {
      http.get(`http://localhost:${PORT}/`, (res) => {
        if (res.statusCode < 500) resolve();
        else setTimeout(attempt, 300);
      }).on('error', () => {
        if (--retries <= 0) reject(new Error('Server did not start'));
        else setTimeout(attempt, 300);
      });
    };
    attempt();
  });
}

// ── Create the app window ─────────────────────────
function createWindow() {
  win = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 800,
    minHeight: 600,
    title: 'Nexus',
    icon: path.join(__dirname, 'icon-192.svg'),
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
    },
  });

  win.loadURL(`http://localhost:${PORT}/`);

  // Open external links in default browser, not Electron
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (!url.startsWith(`http://localhost:${PORT}`)) {
      shell.openExternal(url);
      return { action: 'deny' };
    }
    return { action: 'allow' };
  });

  // Remove default menu (keeps Ctrl+R, F12 for dev)
  Menu.setApplicationMenu(null);

  win.on('closed', () => { win = null; });
}

// ── App lifecycle ─────────────────────────────────
app.whenReady().then(async () => {
  startServer();
  try {
    await waitForServer();
    createWindow();
  } catch (err) {
    console.error(err.message);
    app.quit();
  }
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (win === null) createWindow();
});

app.on('quit', () => {
  if (server) server.kill();
});
