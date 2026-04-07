const { app, BrowserWindow, protocol, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Basic auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

let mainWindow;

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../build/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    if (process.env.NODE_ENV === 'development') {
        mainWindow.loadURL('http://localhost:5173');
        mainWindow.webContents.openDevTools();
    } else {
        mainWindow.loadFile(path.join(__dirname, '../dist/index.html'));
        // Check for updates only in production
        autoUpdater.checkForUpdates();
    }
}

// Auto updater events
autoUpdater.on('checking-for-update', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', 'checking');
});

autoUpdater.on('update-available', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', 'available');
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Available',
        message: `Version ${info.version} is available. Would you like to download it now?`,
        buttons: ['Yes', 'No']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.downloadUpdate();
        }
    });
});

autoUpdater.on('update-not-available', () => {
    if (mainWindow) mainWindow.webContents.send('update-status', 'uptodate');
});

autoUpdater.on('error', (err) => {
    // If GitHub returns 404 or 406, it usually means no releases exist yet.
    // We treat this as "no updates available" for the UI to be less scary.
    if (err?.message?.includes('404') || err?.message?.includes('406')) {
        if (mainWindow) mainWindow.webContents.send('update-status', 'uptodate');
    } else {
        if (mainWindow) mainWindow.webContents.send('update-status', 'error', err?.message || 'Unknown error');
    }
    console.error('Update error:', err);
});

autoUpdater.on('update-downloaded', (info) => {
    if (mainWindow) mainWindow.webContents.send('update-status', 'downloaded');
    dialog.showMessageBox({
        type: 'info',
        title: 'Update Ready',
        message: 'Update downloaded. It will be installed on restart. Restart now?',
        buttons: ['Restart', 'Later']
    }).then((result) => {
        if (result.response === 0) {
            autoUpdater.quitAndInstall();
        }
    });
});

app.whenReady().then(() => {
    // Expose folder path and open action
    ipcMain.handle('get-user-data-path', () => {
        return app.getPath('userData');
    });

    ipcMain.on('manual-check-for-updates', () => {
        if (process.env.NODE_ENV === 'development') {
             if (mainWindow) mainWindow.webContents.send('update-status', 'uptodate');
             return;
        }
        autoUpdater.checkForUpdates();
    });

    ipcMain.on('open-folder', (event, folderPath) => {
        shell.openPath(folderPath);
    });

    createWindow();

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) {
            createWindow();
        }
    });
});

app.on('window-all-closed', () => {
    if (process.platform !== 'darwin') {
        app.quit();
    }
});
