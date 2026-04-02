const { app, BrowserWindow, protocol, ipcMain, shell, dialog } = require('electron');
const path = require('path');
const { autoUpdater } = require('electron-updater');

// Basic auto-updater configuration
autoUpdater.autoDownload = false;
autoUpdater.autoInstallOnAppQuit = true;

function createWindow() {
    const win = new BrowserWindow({
        width: 1200,
        height: 800,
        icon: path.join(__dirname, '../build/icon.png'),
        webPreferences: {
            nodeIntegration: true,
            contextIsolation: false,
        },
    });

    if (process.env.NODE_ENV === 'development') {
        win.loadURL('http://localhost:5173');
        win.webContents.openDevTools();
    } else {
        win.loadFile(path.join(__dirname, '../dist/index.html'));
        // Check for updates only in production
        autoUpdater.checkForUpdates();
    }
}

// Auto updater events
autoUpdater.on('update-available', (info) => {
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

autoUpdater.on('update-downloaded', (info) => {
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
