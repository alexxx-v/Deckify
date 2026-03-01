import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';

export function Settings() {
    const [userDataPath, setUserDataPath] = useState<string | null>(null);

    useEffect(() => {
        // Attempt to fetch the user data folder path via Electron IPC
        if (typeof window !== 'undefined' && 'require' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.invoke('get-user-data-path').then((path: string) => {
                    setUserDataPath(path);
                }).catch(console.error);
            } catch (err) {
                console.error("Could not load electron module:", err);
            }
        }
    }, []);

    const handleOpenFolder = () => {
        if (!userDataPath) return;

        if (typeof window !== 'undefined' && 'require' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ipcRenderer } = (window as any).require('electron');
                ipcRenderer.send('open-folder', userDataPath);
            } catch (err) {
                console.error("Could not load electron module:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Storage Location</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    All application data (Projects, Tasks, and settings) is stored locally on this machine using secure IndexedDB storage.
                </p>

                {userDataPath ? (
                    <div className="space-y-4">
                        <div className="p-4 bg-muted rounded-md border font-mono text-sm break-all">
                            {userDataPath}/IndexedDB
                        </div>
                        <Button onClick={handleOpenFolder} variant="outline" className="flex items-center gap-2">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                            Open Data Folder
                        </Button>
                    </div>
                ) : (
                    <div className="p-4 bg-yellow-50 text-yellow-800 border border-yellow-200 rounded-md text-sm">
                        Storage path is not available in the web preview mode. Please run the desktop application.
                    </div>
                )}
            </div>
        </div>
    );
}
