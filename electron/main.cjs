const { app, BrowserWindow, protocol, ipcMain, shell } = require('electron');
const path = require('path');

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
    }
}

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
