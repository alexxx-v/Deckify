import { useState } from 'react'
import { ProjectList } from './features/projects/ProjectList'
import { ProjectTasks } from './features/projects/ProjectTasks'
import { TaskEditView } from './features/projects/TaskEditView'
import { Dashboard } from './features/dashboard/Dashboard'
import { Settings } from './features/settings/Settings'

type Tab = 'dashboard' | 'projects' | 'settings';

function App() {
  const [activeTab, setActiveTab] = useState<Tab>('dashboard');
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

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

