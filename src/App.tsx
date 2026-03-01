import { useState } from 'react'
import { ProjectList } from './features/projects/ProjectList'
import { ProjectTasks } from './features/projects/ProjectTasks'
import { TaskEditView } from './features/projects/TaskEditView'

function App() {
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [editingTaskId, setEditingTaskId] = useState<string | null>(null);

  return (
    <div className="min-h-screen bg-background text-foreground font-sans antialiased">
      <header className="border-b bg-card">
        <div className="container mx-auto px-4 h-16 flex items-center justify-between">
          <h1
            className="text-xl font-bold tracking-tight cursor-pointer hover:text-primary transition-colors flex items-center gap-2"
            onClick={() => setSelectedProjectId(null)}
          >
            <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-indigo-500"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><path d="M14 2v6h6" /><line x1="16" x2="8" y1="13" y2="13" /><line x1="16" x2="8" y1="17" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
            Task to PDF
          </h1>
        </div>
      </header>

      <main className="container mx-auto px-4 py-8">
        <div className="max-w-4xl mx-auto">
          {editingTaskId ? (
            <TaskEditView
              taskId={editingTaskId}
              onBack={() => setEditingTaskId(null)}
            />
          ) : !selectedProjectId ? (
            <ProjectList onSelect={setSelectedProjectId} />
          ) : (
            <ProjectTasks
              projectId={selectedProjectId}
              onBack={() => setSelectedProjectId(null)}
              onEditTask={(taskId) => setEditingTaskId(taskId)}
            />
          )}
        </div>
      </main>
    </div>
  )
}

export default App
