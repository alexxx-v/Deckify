import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { initDb } from '@/db/schema';
import { useTranslation } from 'react-i18next';

export function Settings() {
    const { t, i18n } = useTranslation();
    const [userDataPath, setUserDataPath] = useState<string | null>(null);
    const [dbPathInput, setDbPathInput] = useState('');
    const [isSaved, setIsSaved] = useState(false);
    const [updateStatus, setUpdateStatus] = useState<'idle' | 'checking' | 'available' | 'uptodate' | 'error' | 'downloaded'>('idle');
    const [updateErrorMessage, setUpdateErrorMessage] = useState<string | null>(null);

    const changeLanguage = (lng: string) => {
        i18n.changeLanguage(lng);
        localStorage.setItem('deckify_language', lng);
    };

    useEffect(() => {
        const path = localStorage.getItem('sqliteDataPath');
        if (path) {
            setUserDataPath(path);
            setDbPathInput(path);
        }
    }, []);

    useEffect(() => {
        if (typeof window !== 'undefined' && 'require' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ipcRenderer } = (window as any).require('electron');
                
                const handleStatus = (_event: any, status: any, message?: string) => {
                    setUpdateStatus(status);
                    if (message) setUpdateErrorMessage(message);
                    if (status === 'uptodate' || status === 'error') {
                        setTimeout(() => {
                             setUpdateStatus('idle');
                             setUpdateErrorMessage(null);
                        }, 8000);
                    }
                };

                ipcRenderer.on('update-status', handleStatus);
                return () => {
                    ipcRenderer.removeListener('update-status', handleStatus);
                };
            } catch (err) {
                console.error("Could not setup update listener:", err);
            }
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

    const handleCheckUpdate = () => {
        if (typeof window !== 'undefined' && 'require' in window) {
            try {
                // eslint-disable-next-line @typescript-eslint/no-var-requires
                const { ipcRenderer } = (window as any).require('electron');
                setUpdateStatus('checking');
                setUpdateErrorMessage(null);
                ipcRenderer.send('manual-check-for-updates');
            } catch (err) {
                console.error("Could not send update check:", err);
            }
        }
    };

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">{t('settings.title')}</h2>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h3 className="text-lg font-semibold mb-2">{t('settings.language')}</h3>
                <div className="mb-6 max-w-xs">
                    <select
                        value={i18n.language}
                        onChange={(e) => changeLanguage(e.target.value)}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                        <option value="en">English</option>
                        <option value="ru">Русский</option>
                    </select>
                </div>

                <div className="border-t pt-6"></div>

                <h3 className="text-lg font-semibold mb-2">{t('settings.dbPath')}</h3>
                <p className="text-sm text-muted-foreground mb-6">
                    {t('settings.dbDescription')}
                </p>

                {userDataPath ? (
                    <div className="space-y-6">
                        <div className="space-y-2">
                            <label className="text-sm font-medium">{t('settings.dbPath')}</label>
                            <div className="flex gap-2">
                                <input
                                    type="text"
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    value={dbPathInput}
                                    onChange={(e) => setDbPathInput(e.target.value)}
                                />
                                <Button onClick={handleSave}>{t('settings.applyChanges')}</Button>
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
                
                <div className="border-t pt-6 mt-6">
                    <div className="flex items-center justify-between">
                        <div>
                            <h3 className="text-lg font-semibold mb-1">{t('settings.appVersion')}</h3>
                            <p className="text-sm text-muted-foreground">
                                v{typeof __APP_VERSION__ !== 'undefined' ? __APP_VERSION__ : 'unknown'}
                            </p>
                        </div>
                        <div className="flex flex-col items-end gap-2">
                            <Button 
                                onClick={handleCheckUpdate} 
                                variant="secondary" 
                                disabled={updateStatus === 'checking' || updateStatus === 'available'}
                                className="min-w-[160px]"
                            >
                                {updateStatus === 'checking' ? t('settings.checking') : t('settings.checkUpdates')}
                            </Button>
                            {updateStatus === 'uptodate' && (
                                <p className="text-xs text-green-600 font-medium">{t('settings.upToDate')}</p>
                            )}
                            {updateStatus === 'available' && (
                                <p className="text-xs text-blue-600 font-medium">{t('settings.updateAvailable')}</p>
                            )}
                            {updateStatus === 'error' && (
                                <div className="text-right max-w-[250px]">
                                    <p className="text-xs text-red-600 font-medium">{t('settings.updateError')}</p>
                                    <p className="text-[10px] text-red-500 mt-1 italic leading-tight">{updateErrorMessage}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
