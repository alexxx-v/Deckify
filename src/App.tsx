import { useState, useEffect } from 'react'
import { ProjectList } from './features/projects/ProjectList'
import { ProjectTasks } from './features/projects/ProjectTasks'
import { TaskEditView } from './features/projects/TaskEditView'
import { Dashboard } from './features/dashboard/Dashboard'
import { Settings } from './features/settings/Settings'
import { TemplatesView } from './features/pdf/TemplatesView'
import { ProjectSettings } from './features/projects/ProjectSettings'
import { initDb } from './db/schema'
import { Button } from './components/ui/button'
import { useTranslation } from 'react-i18next'

type Tab = 'dashboard' | 'projects' | 'settings' | 'templates';

function App() {
  const { t } = useTranslation();
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [selectedProjectSettingsId, setSelectedProjectSettingsId] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [dbPathInput, setDbPathInput] = useState('');
  const [dbError, setDbError] = useState('');
  const [isSidebarOpen, setIsSidebarOpen] = useState(() => {
    const saved = localStorage.getItem('sidebarOpen');
    return saved !== null ? JSON.parse(saved) : true;
  });
  const [isFullWidth, setIsFullWidth] = useState(() => {
    const saved = localStorage.getItem('fullWidth');
    return saved !== null ? JSON.parse(saved) : false;
  });

  const toggleSidebar = () => {
    const newState = !isSidebarOpen;
    setIsSidebarOpen(newState);
    localStorage.setItem('sidebarOpen', JSON.stringify(newState));
  };

  useEffect(() => {
    const savedPath = localStorage.getItem('sqliteDataPath');
    if (savedPath) {
      if (initDb(savedPath)) {
        setDbReady(true);
      } else {
        setDbError('Failed to load database. Path may be invalid.');
        setShowSetup(true);
      }
    } else {
      // First launch
      if (typeof window !== 'undefined' && 'require' in window) {
        try {
          const { ipcRenderer } = (window as any).require('electron');
          ipcRenderer.invoke('get-user-data-path').then((userDataPath: string) => {
            setDbPathInput(userDataPath + '/deckify.db');
            setShowSetup(true);
          });
        } catch (err) {
          setDbPathInput('./deckify.db');
          setShowSetup(true);
        }
      } else {
        setDbPathInput('./deckify.db');
        setShowSetup(true);
      }
    }
  }, []);

  const handleSaveDbConfig = () => {
    if (!dbPathInput.trim()) return;
    if (initDb(dbPathInput.trim())) {
      localStorage.setItem('sqliteDataPath', dbPathInput.trim());
      setDbReady(true);
      setShowSetup(false);
    } else {
      setDbError('Failed to initialize SQLite at that path.');
    }
  };

  const navigateTo = (tab: Tab) => {
    setActiveTab(tab);
    setSelectedProjectId(null);
    setEditingTaskId(null);
  };

  const navItemClass = (tab: Tab) =>
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-all duration-200 cursor-pointer font-medium ${activeTab === tab && !selectedProjectId && !editingTaskId
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    } ${!isSidebarOpen ? 'justify-center px-0' : ''}`;

  if (!dbReady) {
    if (showSetup) {
      return (
        <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-2xl shadow-xl border p-8 text-center animate-in fade-in zoom-in duration-300">
            <div className="mx-auto w-16 h-16 bg-indigo-50 rounded-full flex items-center justify-center mb-6 text-indigo-600 ring-8 ring-indigo-50/50">
              <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" /></svg>
            </div>

            <h2 className="text-2xl font-bold tracking-tight mb-2 text-foreground">
              Welcome to Deckify
            </h2>
            <p className="text-sm text-muted-foreground mb-8 text-balance">
              Deckify is a Local-First application. Please confirm where you'd like to privately securely store your project data.
            </p>

            {dbError && (
              <div className="p-3 mb-6 bg-destructive/10 text-destructive rounded-lg text-sm border border-destructive/20 text-left flex items-start gap-2">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 mt-0.5"><circle cx="12" cy="12" r="10" /><line x1="12" x2="12" y1="8" y2="12" /><line x1="12" x2="12.01" y1="16" y2="16" /></svg>
                <span>{dbError}</span>
              </div>
            )}

            <div className="space-y-4 text-left">
              <div className="space-y-2">
                <label className="text-sm font-semibold text-foreground">Database Storage Path</label>
                <input
                  type="text"
                  value={dbPathInput}
                  onChange={(e) => setDbPathInput(e.target.value)}
                  className="flex h-10 w-full rounded-lg border border-input bg-muted/50 px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                />
                <p className="text-[11px] text-muted-foreground leading-relaxed">
                  We've suggested a safe default location in your user directory. You can change this if you prefer storing your data elsewhere.
                </p>
              </div>
              <div className="pt-4">
                <Button
                  onClick={handleSaveDbConfig}
                  className="bg-indigo-600 hover:bg-indigo-700 text-white w-full h-11 text-base font-medium rounded-xl shadow-sm transition-all active:scale-[0.98]"
                >
                  Get Started
                </Button>
              </div>
            </div>
          </div>

          <p className="mt-8 text-xs text-muted-foreground">
            Your data never leaves your device unless you export it.
          </p>
        </div>
      );
    }
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading Setup...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex flex-row">
      {/* Sidebar Navigation */}
      <aside className={`border-r bg-card h-screen fixed flex flex-col pt-8 transition-all duration-300 z-40 ${isSidebarOpen ? 'w-64' : 'w-20'}`}>
        <div className={`mb-8 flex items-center text-indigo-600 ${isSidebarOpen ? 'px-6 gap-2' : 'justify-center'}`}>
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          {isSidebarOpen && <h1 className="text-2xl font-bold tracking-tight text-foreground whitespace-nowrap overflow-hidden">Deckify</h1>}
        </div>

        <nav className={`flex flex-col gap-2 ${isSidebarOpen ? 'px-4' : 'px-2'}`}>
          <a className={navItemClass('dashboard')} onClick={() => navigateTo('dashboard')} title={!isSidebarOpen ? t('sidebar.dashboard') : undefined}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
            {isSidebarOpen && <span className="whitespace-nowrap overflow-hidden">{t('sidebar.dashboard')}</span>}
          </a>
          <a className={navItemClass('projects')} onClick={() => navigateTo('projects')} title={!isSidebarOpen ? t('sidebar.projects') : undefined}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
            {isSidebarOpen && <span className="whitespace-nowrap overflow-hidden">{t('sidebar.projects')}</span>}
          </a>
          <a className={navItemClass('templates')} onClick={() => navigateTo('templates')} title={!isSidebarOpen ? t('sidebar.templates') : undefined}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            {isSidebarOpen && <span className="whitespace-nowrap overflow-hidden">{t('sidebar.templates', 'Templates')}</span>}
          </a>
          <a className={navItemClass('settings')} onClick={() => navigateTo('settings')} title={!isSidebarOpen ? t('sidebar.settings') : undefined}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
            {isSidebarOpen && <span className="whitespace-nowrap overflow-hidden">{t('sidebar.settings')}</span>}
          </a>
        </nav>

        <div className="mt-auto mb-4 w-full flex justify-center border-t pt-4 px-2">
          <Button variant="ghost" size="icon" onClick={toggleSidebar} className="text-muted-foreground hover:bg-muted hover:text-foreground">
            {isSidebarOpen ? (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
            ) : (
              <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
            )}
          </Button>
        </div>
      </aside>

      {/* Main Content Area */}
      <main className={`flex-1 p-8 overflow-y-auto min-h-screen transition-all duration-300 w-full ${isSidebarOpen ? 'ml-64' : 'ml-20'}`}>
        <div className={`mx-auto transition-all duration-300 ${isFullWidth ? 'max-w-none' : 'max-w-5xl'}`}>
          <div key={activeTab + (selectedProjectId || '') + (editingTaskId || '')} className="animate-in fade-in zoom-in-95 duration-300 fill-mode-both">
            {editingTaskId ? (
              <TaskEditView
                taskId={editingTaskId}
                onBack={() => setEditingTaskId(null)}
              />
            ) : selectedProjectSettingsId ? (
              <ProjectSettings
                projectId={selectedProjectSettingsId}
                onBack={() => setSelectedProjectSettingsId(null)}
              />
            ) : selectedProjectId ? (
              <ProjectTasks
                projectId={selectedProjectId}
                onBack={() => setSelectedProjectId(null)}
                onEditTask={(taskId) => setEditingTaskId(taskId)}
                onOpenSettings={() => setSelectedProjectSettingsId(selectedProjectId)}
              />
            ) : activeTab === 'dashboard' ? (
              <Dashboard />
            ) : activeTab === 'templates' ? (
              <TemplatesView />
            ) : activeTab === 'settings' ? (
              <Settings isFullWidth={isFullWidth} onToggleFullWidth={(v) => {
                setIsFullWidth(v);
                localStorage.setItem('fullWidth', JSON.stringify(v));
              }} />
            ) : (
              <ProjectList onSelect={(id) => { setSelectedProjectId(id); setActiveTab('projects'); }} />
            )}
          </div>
        </div>
      </main>
    </div>
  )
}

export default App

