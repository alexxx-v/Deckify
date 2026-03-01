import { useState, useEffect } from 'react'
import { ProjectList } from './features/projects/ProjectList'
import { ProjectTasks } from './features/projects/ProjectTasks'
import { TaskEditView } from './features/projects/TaskEditView'
import { Dashboard } from './features/dashboard/Dashboard'
import { Settings } from './features/settings/Settings'
import { initDb } from './db/schema'
import { Button } from './components/ui/button'

type Tab = 'dashboard' | 'projects' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);
  const [dbReady, setDbReady] = useState(false);
  const [showSetup, setShowSetup] = useState(false);
  const [dbPathInput, setDbPathInput] = useState('');
  const [dbError, setDbError] = useState('');

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
    `flex items-center gap-3 px-4 py-3 rounded-lg transition-colors cursor-pointer font-medium ${activeTab === tab && !selectedProjectId && !editingTaskId
      ? 'bg-indigo-50 text-indigo-700'
      : 'text-muted-foreground hover:bg-muted hover:text-foreground'
    }`;

  if (!dbReady) {
    if (showSetup) {
      return (
        <div className="min-h-screen bg-background flex items-center justify-center p-4">
          <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6">
            <h2 className="text-2xl font-bold mb-4">Database Setup</h2>
            <p className="text-sm text-muted-foreground mb-6">
              Welcome to Deckify! Please specify where you would like to store your SQLite database file.
            </p>
            {dbError && <div className="p-3 mb-4 bg-red-50 text-red-800 rounded text-sm border border-red-200">{dbError}</div>}
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1.5 block">Database File Path</label>
                <input
                  type="text"
                  value={dbPathInput}
                  onChange={(e) => setDbPathInput(e.target.value)}
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                />
              </div>
              <div className="pt-4 flex justify-end">
                <Button onClick={handleSaveDbConfig} className="bg-indigo-600 hover:bg-indigo-700 text-white w-full">
                  Save & Continue
                </Button>
              </div>
            </div>
          </div>
        </div>
      );
    }
    return <div className="min-h-screen flex items-center justify-center"><p className="text-muted-foreground">Loading Setup...</p></div>;
  }

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased flex">
      {/* Sidebar Navigation */}
      <aside className="w-64 border-r bg-card h-screen fixed flex flex-col pt-8">
        <div className="px-6 mb-8 flex items-center gap-2">
          <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-600"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
          <h1 className="text-2xl font-bold tracking-tight text-foreground">Deckify</h1>
        </div>

        <nav className="flex flex-col gap-2 px-4">
          <a className={navItemClass('dashboard')} onClick={() => navigateTo('dashboard')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="7" height="9" x="3" y="3" rx="1" /><rect width="7" height="5" x="14" y="3" rx="1" /><rect width="7" height="9" x="14" y="12" rx="1" /><rect width="7" height="5" x="3" y="16" rx="1" /></svg>
            Dashboard
          </a>
          <a className={navItemClass('projects')} onClick={() => navigateTo('projects')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
            All Projects
          </a>
          <a className={navItemClass('settings')} onClick={() => navigateTo('settings')}>
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
            Settings
          </a>
        </nav>
      </aside>

      {/* Main Content Area */}
      <main className="flex-1 ml-64 p-8 overflow-y-auto min-h-screen">
        <div className="max-w-5xl mx-auto">
          {editingTaskId ? (
            <TaskEditView
              taskId={editingTaskId}
              onBack={() => setEditingTaskId(null)}
            />
          ) : selectedProjectId ? (
            <ProjectTasks
              projectId={selectedProjectId}
              onBack={() => setSelectedProjectId(null)}
              onEditTask={(taskId) => setEditingTaskId(taskId)}
            />
          ) : activeTab === 'dashboard' ? (
            <Dashboard />
          ) : activeTab === 'settings' ? (
            <Settings />
          ) : (
            <ProjectList onSelect={(id) => { setSelectedProjectId(id); setActiveTab('projects'); }} />
          )}
        </div>
      </main>
    </div>
  )
}

export default App

