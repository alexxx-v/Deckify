import { useState } from 'react';
import { db } from '@/db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { ExportModal } from '../pdf/ExportModal';

export function ProjectTasks({ projectId, onBack, onEditTask }: { projectId: string, onBack: () => void, onEditTask: (taskId: string) => void }) {
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [currentPage, setCurrentPage] = useState(1);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newStartDate, setNewStartDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [newDuration, setNewDuration] = useState('5');
    const [newProgress, setNewProgress] = useState('0');

    // Removed inline editing state

    const project = useLiveQuery(() => db.projects.get(projectId));
    const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(projectId).sortBy('startDate'));

    const pageSize = 10;
    const totalTasks = tasks?.length || 0;
    const totalPages = Math.ceil(totalTasks / pageSize);
    const paginatedTasks = tasks ? tasks.slice((currentPage - 1) * pageSize, currentPage * pageSize) : [];

    // Ensure we don't end up on an empty page if we delete the last item on it
    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }

    const addTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        await db.tasks.add({
            id: uuidv4(),
            projectId,
            title: newTitle.trim(),
            description: newDescription.trim(),
            startDate: newStartDate,
            duration: parseInt(newDuration, 10) || 1,
            progress: parseInt(newProgress, 10) || 0
        });

        setNewTitle('');
        setNewDescription('');
        setNewProgress('0');
        setShowAddModal(false);
        // keep date and duration the same for easy adding of consecutive tasks
    };

    // Removed inline editing functions

    const updateProgress = async (id: string, newProgressVal: number) => {
        await db.tasks.update(id, { progress: newProgressVal });
    };

    const deleteTask = async (id: string) => {
        if (confirm('Delete this task?')) {
            await db.tasks.delete(id);
        }
    };

    if (!project) return <div>Loading project...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center justify-between">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={onBack}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </Button>
                    <h2 className="text-2xl font-bold">{project.name}</h2>
                </div>
                <div className="flex items-center gap-3">
                    <Button onClick={() => setShowAddModal(true)}>
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                        Add Task
                    </Button>
                    <Button
                        variant="default"
                        className="bg-indigo-600 hover:bg-indigo-700 text-white"
                        onClick={() => setShowExportModal(true)}
                    >
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                        Export PDF
                    </Button>
                </div>
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
                    <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border p-6">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">Add New Task</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <form onSubmit={addTask} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Title</label>
                                    <input
                                        required
                                        type="text"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder="Task name"
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Start Date</label>
                                    <input
                                        required
                                        type="date"
                                        value={newStartDate}
                                        onChange={(e) => setNewStartDate(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-sm font-medium mb-1 block">Description (optional)</label>
                                    <textarea
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        placeholder="Add task details..."
                                        rows={3}
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">Duration (days)</label>
                                    <input
                                        required
                                        type="number"
                                        min="1"
                                        value={newDuration}
                                        onChange={(e) => setNewDuration(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t mt-6">
                                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>Cancel</Button>
                                <Button type="submit">Add Task</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="space-y-3">
                {tasks?.length === 0 && (
                    <p className="text-muted-foreground text-center py-8">No tasks for this company yet.</p>
                )}
                {paginatedTasks.map(task => (
                    <div key={task.id} className="bg-card border rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
                        <div className="flex-1">
                            <h4 className="font-semibold text-lg">{task.title}</h4>
                            <p className="text-sm text-muted-foreground mt-1">
                                Starts: {dayjs(task.startDate).format('MMM D, YYYY')} • Duration: {task.duration} days
                            </p>
                        </div>

                        <div className="flex items-center gap-4 w-full sm:w-auto self-center">
                            <div className="flex-1 sm:w-48 flex items-center gap-3">
                                <span className="text-sm font-medium w-9">{task.progress}%</span>
                                <input
                                    type="range"
                                    min="0" max="100" step="5"
                                    value={task.progress}
                                    onChange={(e) => updateProgress(task.id, parseInt(e.target.value, 10))}
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                                />
                            </div>
                            <div className="flex shrink-0">
                                <button
                                    onClick={() => onEditTask(task.id)}
                                    className="text-muted-foreground hover:text-primary p-2"
                                    title="Edit Task"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9" /><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z" /></svg>
                                </button>
                                <button
                                    onClick={() => deleteTask(task.id)}
                                    className="text-muted-foreground hover:text-destructive p-2"
                                    title="Delete Task"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                </button>
                            </div>
                        </div>
                    </div>
                ))}
            </div>
            {totalPages > 1 && (
                <div className="flex justify-center items-center gap-4 pt-4">
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
                        disabled={currentPage === 1}
                    >
                        Previous
                    </Button>
                    <span className="text-sm font-medium text-muted-foreground">
                        Page {currentPage} of {totalPages}
                    </span>
                    <Button
                        variant="outline"
                        size="sm"
                        onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                        disabled={currentPage === totalPages}
                    >
                        Next
                    </Button>
                </div>
            )}
            {showExportModal && (
                <ExportModal
                    project={project}
                    tasks={tasks || []}
                    onClose={() => setShowExportModal(false)}
                />
            )}
        </div>
    );
}
