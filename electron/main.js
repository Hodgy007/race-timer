const { app, BrowserWindow } = require('electron');
const path = require('path');

function createWindow() {
  const win = new BrowserWindow({
    width: 1400,
    height: 900,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      // Keep timers full speed when the window is minimised or unfocused
      backgroundThrottling: false
    },
    title: 'Race Timer'
  });

  win.loadFile(path.join(__dirname, '../dist/harpenden-arrows-handicap-timer/index.html'));
  win.removeMenu();
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
