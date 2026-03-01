import { useState } from 'react';
import { db } from '@/db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { ExportModal } from '../pdf/ExportModal';

const getStatusBadgeClass = (status?: string) => {
    switch (status) {
        case 'done': return 'bg-green-100 text-green-800 border-green-200';
        case 'progress': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'hold': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'backlog':
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

const getRoadmapColor = (status?: string) => {
    switch (status) {
        case 'done': return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.4)' };
        case 'progress': return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.4)' };
        case 'hold': return { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgb(234, 179, 8)', fill: 'rgba(234, 179, 8, 0.4)' };
        case 'backlog':
        default: return { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgb(107, 114, 128)', fill: 'rgba(107, 114, 128, 0.4)' };
    }
}

export function ProjectTasks({ projectId, onBack, onEditTask }: { projectId: string, onBack: () => void, onEditTask: (taskId: string) => void }) {
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'roadmap'>('list');
    const [timeframe, setTimeframe] = useState<'all' | 'month' | 'quarter' | 'year'>('all');
    const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM'));
    const [currentPage, setCurrentPage] = useState(1);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newStartDate, setNewStartDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [newDuration, setNewDuration] = useState('5');
    const [newProgress, setNewProgress] = useState('0');
    const [newStatus, setNewStatus] = useState<'backlog' | 'progress' | 'hold' | 'done'>('backlog');

    // Removed inline editing state

    const project = useLiveQuery(() => db.projects.get(projectId));
    const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(projectId).sortBy('startDate'));

    // Filter tasks by timeframe
    const filteredTasks = (tasks || []).filter(t => {
        if (timeframe === 'all') return true;
        const taskStart = dayjs(t.startDate);
        const taskEnd = dayjs(t.startDate).add(t.duration, 'day');
        const baseDate = dayjs(filterDate + '-01');
        let rangeStart = baseDate, rangeEnd = baseDate;

        if (timeframe === 'month') {
            rangeStart = baseDate.startOf('month');
            rangeEnd = baseDate.endOf('month');
        } else if (timeframe === 'quarter') {
            const startMonth = Math.floor(baseDate.month() / 3) * 3;
            rangeStart = baseDate.month(startMonth).startOf('month');
            rangeEnd = rangeStart.add(2, 'month').endOf('month');
        } else if (timeframe === 'year') {
            rangeStart = baseDate.startOf('year');
            rangeEnd = baseDate.endOf('year');
        }

        // Check if task overlaps with the timeframe
        return taskStart.isBefore(rangeEnd) && taskEnd.isAfter(rangeStart);
    });

    const pageSize = 10;
    const totalTasks = filteredTasks.length;
    const totalPages = Math.ceil(totalTasks / pageSize);
    const paginatedTasks = filteredTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    // Ensure we don't end up on an empty page if we delete the last item on it
    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }

    // Roadmap calculations based on timeframe
    let minDate = dayjs(), maxDate = dayjs();

    if (timeframe === 'all') {
        minDate = filteredTasks.length > 0 ? dayjs(filteredTasks[0].startDate) : dayjs();
        maxDate = minDate;
        filteredTasks.forEach(t => {
            const end = dayjs(t.startDate).add(t.duration, 'day');
            if (end.isAfter(maxDate)) maxDate = end;
        });
    } else {
        const baseDate = dayjs(filterDate + '-01');
        if (timeframe === 'month') {
            minDate = baseDate.startOf('month');
            maxDate = baseDate.endOf('month');
        } else if (timeframe === 'quarter') {
            const startMonth = Math.floor(baseDate.month() / 3) * 3;
            minDate = baseDate.month(startMonth).startOf('month');
            maxDate = minDate.add(2, 'month').endOf('month');
        } else if (timeframe === 'year') {
            minDate = baseDate.startOf('year');
            maxDate = baseDate.endOf('year');
        }
    }
    const totalDays = Math.max(1, maxDate.diff(minDate, 'day'));

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
            progress: parseInt(newProgress, 10) || 0,
            status: newStatus
        });

        setNewTitle('');
        setNewDescription('');
        setNewProgress('0');
        setNewStatus('backlog');
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

                <div className="flex items-center gap-4">
                    <div className="hidden md:flex items-center gap-2 bg-muted p-1 rounded-lg">
                        <input
                            type="month"
                            value={filterDate}
                            onChange={(e) => setFilterDate(e.target.value)}
                            disabled={timeframe === 'all'}
                            title="Select reference period"
                            className={`h-7 px-2 text-xs rounded-md border-0 bg-background shadow-sm focus:ring-0 ${timeframe === 'all' ? 'opacity-50 cursor-not-allowed' : ''}`}
                        />
                        <div className="h-4 w-px bg-border mx-1"></div>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('all')}>All Time</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('year')}>Year</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'quarter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('quarter')}>Quarter</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('month')}>Month</button>
                    </div>

                    <div className="hidden sm:flex bg-muted p-1 rounded-lg">
                        <button
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setViewMode('list')}
                        >
                            List
                        </button>
                        <button
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'roadmap' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setViewMode('roadmap')}
                        >
                            Roadmap
                        </button>
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
                                    <label className="text-sm font-medium mb-1 block">Status</label>
                                    <select
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as any)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="backlog">Backlog</option>
                                        <option value="progress">In Progress</option>
                                        <option value="hold">On Hold</option>
                                        <option value="done">Done</option>
                                    </select>
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

            <div className="mt-6">
                {filteredTasks.length === 0 ? (
                    <p className="text-muted-foreground text-center py-8">No tasks found for this timeframe.</p>
                ) : viewMode === 'list' ? (
                    <>
                        <div className="space-y-3">
                            {paginatedTasks.map(task => (
                                <div key={task.id} className="bg-card border rounded-lg p-4 shadow-sm flex flex-col sm:flex-row sm:items-baseline justify-between gap-4">
                                    <div className="flex-1">
                                        <h4 className="font-semibold text-lg hover:underline cursor-pointer" onClick={() => onEditTask(task.id)}>{task.title}</h4>
                                        <p className="text-sm text-muted-foreground mt-1 flex flex-wrap items-center gap-2">
                                            <span>Starts: {dayjs(task.startDate).format('MMM D, YYYY')} • Duration: {task.duration} days</span>
                                            <span className={`inline-flex items-center px-1.5 py-0.5 rounded-sm text-[10px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                                                {task.status || 'backlog'}
                                            </span>
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
                            <div className="flex justify-center items-center gap-4 pt-6">
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
                    </>
                ) : (
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center">
                            <h3 className="font-semibold px-4 pt-3 pb-2 text-foreground/80">Visual Roadmap</h3>
                            <div className="text-sm text-muted-foreground font-medium capitalize">
                                {timeframe === 'all' ? 'Entire Project' : `${timeframe} of ${dayjs(filterDate + '-01').format('MMMM YYYY')}`} • {minDate.format('MMM D, YYYY')} - {maxDate.format('MMM D, YYYY')}
                            </div>
                        </div>
                        <div className="p-6 overflow-x-auto">
                            <div className="min-w-[800px] overflow-hidden relative">
                                {/* Timeline markers */}
                                <div className="flex relative h-6 mb-4 border-b">
                                    {[0, 25, 50, 75, 100].map(percent => (
                                        <div key={percent} className="absolute h-full border-l text-[10px] font-medium text-muted-foreground pl-1" style={{ left: `${percent}%` }}>
                                            {minDate.add((totalDays * percent) / 100, 'day').format('MMM D')}
                                        </div>
                                    ))}
                                </div>
                                {/* Task bars container (clips overrun) */}
                                <div className="space-y-4 pb-2">
                                    {filteredTasks.map((task) => {
                                        const taskStartDiff = dayjs(task.startDate).diff(minDate, 'day');
                                        const leftPercentRaw = (taskStartDiff / totalDays) * 100;
                                        const widthPercentRaw = (task.duration / totalDays) * 100;
                                        const colors = getRoadmapColor(task.status);

                                        return (
                                            <div key={task.id} className="relative h-10 group cursor-pointer" onClick={() => onEditTask(task.id)}>
                                                <div
                                                    className="absolute top-1 bottom-1 rounded-md opacity-80 hover:opacity-100 transition-opacity border backdrop-blur-sm shadow-sm flex items-center overflow-hidden"
                                                    style={{
                                                        left: `${leftPercentRaw}%`,
                                                        width: `${widthPercentRaw}%`,
                                                        backgroundColor: colors.bg,
                                                        borderColor: colors.border
                                                    }}
                                                >
                                                    {/* Progress fill inside bar */}
                                                    <div className="absolute inset-y-0 left-0 transition-all" style={{ width: `${task.progress}%`, backgroundColor: colors.fill }}></div>

                                                    <div className="absolute inset-0 px-2 flex items-center text-xs font-semibold whitespace-nowrap overflow-hidden text-ellipsis text-foreground shadow-sm">
                                                        {task.title} ({task.progress}%)
                                                    </div>
                                                </div>
                                            </div>
                                        );
                                    })}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>
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
