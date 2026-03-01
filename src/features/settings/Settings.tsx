import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { initDb } from '@/db/schema';

export function Settings() {
    const [userDataPath, setUserDataPath] = useState<string | null>(null);
    const [dbPathInput, setDbPathInput] = useState('');
    const [isSaved, setIsSaved] = useState(false);

    useEffect(() => {
        const path = localStorage.getItem('sqliteDataPath');
        if (path) {
            setUserDataPath(path);
            setDbPathInput(path);
        }
    }, []);

    const handleSave = () => {
        if (!dbPathInput.trim()) return;
        if (initDb(dbPathInput.trim())) {
            localStorage.setItem('sqliteDataPath', dbPathInput.trim());
            setUserDataPath(dbPathInput.trim());
            setIsSaved(true);
            setTimeout(() => setIsSaved(false), 3000);

            // Reload page to re-render all hooks
            window.location.reload();
        } else {
            alert('Failed to initialize SQLite database at the specified path.');
        }
    };

    const handleOpenFolder = () => {
        if (!userDataPath) return;

        if (typeof window !== 'undefined' && 'require' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ipcRenderer } = (window as any).require('electron');

                // Get directory of file
                const folderPath = userDataPath.substring(0, Math.max(userDataPath.lastIndexOf('/'), userDataPath.lastIndexOf('\\')));
                ipcRenderer.send('open-folder', folderPath || userDataPath);
            } catch (err) {
                console.error("Could not load electron module:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Settings</h2>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">Database Storage Location</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    All application data is stored locally in an SQLite database file. You can change its location below.
                </p>

                {userDataPath ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">SQLite File Path</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={dbPathInput}
                                    onChange={(e) => setDbPathInput(e.target.value)}
                                />
                                <Button onClick={handleSave}>Apply</Button>
                            </div>
                            {isSaved && <p className="text-xs text-green-600 font-medium">Saved successfully! App reloaded.</p>}
                        </div>

                        <div className="pt-4 border-t">
                            <Button onClick={handleOpenFolder} variant="outline" className="flex items-center gap-2">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
                                Open Data Folder
                            </Button>
                        </div>
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
