import { useState, useEffect } from 'react';
import { db, useLiveQuery } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { ExportModal } from '../pdf/ExportModal';
import { useTranslation } from 'react-i18next';
import { DraggableTaskBar } from './DraggableTaskBar';

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
    const { t } = useTranslation();
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'roadmap'>(() => {
        return (localStorage.getItem('deckify_viewMode') as any) || 'list';
    });
    const [timeframe, setTimeframe] = useState<'all' | 'month' | 'quarter' | 'year'>(() => {
        return (localStorage.getItem('deckify_timeframe') as any) || 'month';
    });
    const [filterDate, setFilterDate] = useState(dayjs().format('YYYY-MM'));
    const [currentPage, setCurrentPage] = useState(1);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newStartDate, setNewStartDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [newDuration, setNewDuration] = useState('5');
    const [newDurationUnit, setNewDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');
    const [newProgress, setNewProgress] = useState('0');
    const [newStatus, setNewStatus] = useState<'backlog' | 'progress' | 'hold' | 'done'>('backlog');

    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const [editProjectName, setEditProjectName] = useState('');    // Removed inline editing state

    useEffect(() => {
        localStorage.setItem('deckify_viewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('deckify_timeframe', timeframe);
    }, [timeframe]);

    const project = useLiveQuery(() => db.projects.get(projectId));
    const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(projectId).sortBy('startDate'));

    // Filter tasks by timeframe
    const filteredTasks = (tasks || []).filter((t: any) => {
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
        filteredTasks.forEach((t: any) => {
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

    const timelineMarkers: Array<{ label: string, percent: number }> = [];
    let currentMarker = minDate.startOf('month');
    if (currentMarker.isBefore(minDate) || currentMarker.isSame(minDate, 'day')) {
        currentMarker = currentMarker.add(1, 'month');
    }
    while (currentMarker.isBefore(maxDate)) {
        const daysOffset = currentMarker.diff(minDate, 'day');
        const percent = (daysOffset / totalDays) * 100;
        if (percent > 2 && percent < 98) {
            timelineMarkers.push({
                label: currentMarker.format('MMM YYYY'),
                percent: percent
            });
        }
        currentMarker = currentMarker.add(1, 'month');
    }

    const addTask = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTitle.trim()) return;

        let calculatedDuration = parseInt(newDuration, 10) || 1;
        if (newDurationUnit === 'months') {
            calculatedDuration = dayjs(newStartDate).add(calculatedDuration, 'month').diff(dayjs(newStartDate), 'day');
        } else if (newDurationUnit === 'weeks') {
            calculatedDuration *= 7;
        }

        await db.tasks.add({
            id: uuidv4(),
            projectId,
            title: newTitle.trim(),
            description: newDescription.trim(),
            startDate: newStartDate,
            duration: calculatedDuration,
            progress: parseInt(newProgress, 10) || 0,
            status: newStatus
        });

        setNewTitle('');
        setNewDescription('');
        setNewProgress('0');
        setNewDurationUnit('days');
        setNewStatus('backlog');
        setShowAddModal(false);
        // keep date and duration the same for easy adding of consecutive tasks
    };

    // Removed inline editing functions

    const handleSaveProjectName = async () => {
        if (!editProjectName.trim() || editProjectName === project?.name) {
            setIsEditingProjectName(false);
            return;
        }
        await db.projects.update(projectId, { name: editProjectName.trim() });
        setIsEditingProjectName(false);
    };

    const handleEditProjectNameClick = () => {
        setEditProjectName(project?.name || '');
        setIsEditingProjectName(true);
    };


    if (!project) return <div>Loading project...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                {/* Header Row: Title & Primary Actions */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                        <Button variant="outline" size="icon" onClick={onBack} className="shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </Button>
                        {isEditingProjectName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={editProjectName}
                                    onChange={(e) => setEditProjectName(e.target.value)}
                                    onBlur={handleSaveProjectName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveProjectName();
                                        if (e.key === 'Escape') setIsEditingProjectName(false);
                                    }}
                                    autoFocus
                                    className="flex h-10 w-full sm:w-[300px] rounded-md border border-input bg-background px-3 py-2 text-xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={handleEditProjectNameClick} title="Edit Project Name">
                                <h2 className="text-2xl font-bold line-clamp-1">{project.name}</h2>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <Button onClick={() => setShowAddModal(true)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            {t('tasks.addTask')}
                        </Button>
                        <Button
                            variant="default"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => setShowExportModal(true)}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                            {t('tasks.exportPdf')}
                        </Button>
                    </div>
                </div>

                {/* Filter Row */}
                <div className="flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4">
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
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'all' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('all')}>{t('tasks.allTime')}</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('year')}>{t('tasks.year')}</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'quarter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('quarter')}>{t('tasks.quarter')}</button>
                        <button className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe('month')}>{t('tasks.month')}</button>
                    </div>

                    <div className="hidden sm:flex bg-muted p-1 rounded-lg">
                        <button
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setViewMode('list')}
                        >
                            {t('tasks.list')}
                        </button>
                        <button
                            className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${viewMode === 'roadmap' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            onClick={() => setViewMode('roadmap')}
                        >
                            {t('tasks.roadmap')}
                        </button>
                    </div>
                </div>
            </div>

            {showAddModal && (
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border p-6 animate-in zoom-in-95 duration-200">
                        <div className="flex justify-between items-center mb-6">
                            <h2 className="text-xl font-bold">{t('taskEdit.addTask')}</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <form onSubmit={addTask} className="space-y-4">
                            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                                <div>
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.title')}</label>
                                    <input
                                        required
                                        type="text"
                                        value={newTitle}
                                        onChange={(e) => setNewTitle(e.target.value)}
                                        placeholder={t('taskEdit.taskNamePlaceholder')}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.status')}</label>
                                    <select
                                        value={newStatus}
                                        onChange={(e) => setNewStatus(e.target.value as any)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="backlog">{t('taskEdit.backlog')}</option>
                                        <option value="progress">{t('taskEdit.inProgress')}</option>
                                        <option value="hold">{t('taskEdit.onHold')}</option>
                                        <option value="done">{t('taskEdit.done')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.startDate')}</label>
                                    <input
                                        required
                                        type="date"
                                        value={newStartDate}
                                        onChange={(e) => setNewStartDate(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    />
                                </div>
                                <div className="md:col-span-2">
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.descriptionOptional')}</label>
                                    <textarea
                                        value={newDescription}
                                        onChange={(e) => setNewDescription(e.target.value)}
                                        placeholder={t('taskEdit.descriptionPlaceholder')}
                                        rows={3}
                                        className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                                    />
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.duration')}</label>
                                    <div className="flex gap-2">
                                        <input
                                            required
                                            type="number"
                                            min="1"
                                            value={newDuration}
                                            onChange={(e) => setNewDuration(e.target.value)}
                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        />
                                        <select
                                            value={newDurationUnit}
                                            onChange={(e) => setNewDurationUnit(e.target.value as any)}
                                            className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                        >
                                            <option value="days">{t('taskEdit.days')}</option>
                                            <option value="weeks">{t('taskEdit.weeks')}</option>
                                            <option value="months">{t('taskEdit.months')}</option>
                                        </select>
                                    </div>
                                </div>
                            </div>
                            <div className="pt-4 flex justify-end gap-3 border-t mt-6">
                                <Button type="button" variant="outline" onClick={() => setShowAddModal(false)}>{t('taskEdit.cancel')}</Button>
                                <Button type="submit">{t('taskEdit.submitAdd')}</Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}

            <div className="mt-6">
                {filteredTasks.length === 0 ? (
                    tasks.length === 0 ? (
                        <div className="flex flex-col items-center justify-center p-12 mt-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/5 animate-in fade-in zoom-in duration-500">
                            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="12" x2="12" y1="18" y2="12" /><line x1="9" x2="15" y1="15" y2="15" /></svg>
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">{t('tasks.noTasks')}</h3>
                            <p className="text-sm text-muted-foreground max-w-sm text-balance mb-6">
                                В этом проекте пока нет ни одной задачи. Создайте первую задачу, чтобы составить план!
                            </p>
                            <Button onClick={() => setShowAddModal(true)} variant="secondary" className="shadow-sm">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                {t('tasks.addTask')}
                            </Button>
                        </div>
                    ) : (
                        <div className="flex flex-col items-center justify-center p-12 mt-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/5 animate-in fade-in zoom-in duration-500">
                            <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                            </div>
                            <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">Ничего не найдено</h3>
                            <p className="text-sm text-muted-foreground max-w-sm text-balance mb-6">
                                Задач в выбранном периоде (с {minDate.format('MMM D')} по {maxDate.format('MMM D, YYYY')}) не найдено.
                            </p>
                            <Button onClick={() => setTimeframe('all')} variant="outline">
                                Показать все задачи
                            </Button>
                        </div>
                    )
                ) : viewMode === 'list' ? (
                    <>
                        <div className="space-y-2">
                            {paginatedTasks.map((task: any) => (
                                <div
                                    key={task.id}
                                    onClick={() => onEditTask(task.id)}
                                    className="bg-card border rounded-lg px-4 py-3 shadow-sm hover:shadow-md transition-all cursor-pointer flex flex-col sm:flex-row sm:items-center justify-between gap-4 group hover:border-primary/40"
                                >
                                    <div className="flex-1 flex items-center gap-4 min-w-0 pr-4">
                                        <div className="shrink-0 w-10 text-right font-semibold text-sm tabular-nums text-muted-foreground group-hover:text-foreground transition-colors">{task.progress}%</div>
                                        <h4 className="font-medium truncate text-foreground group-hover:text-primary transition-colors">{task.title}</h4>
                                    </div>

                                    <div className="flex items-center gap-4 shrink-0 text-sm">
                                        <div className="hidden md:block text-muted-foreground tabular-nums min-w-[200px] text-right">
                                            {dayjs(task.startDate).format('MMM D')} - {dayjs(task.startDate).add(task.duration, 'day').format('MMM D, YYYY')} <span className="text-xs opacity-60 ml-1">({task.duration}d)</span>
                                        </div>
                                        <span className={`w-24 justify-center inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                                            {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                        </span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/50 group-hover:text-primary transition-colors"><path d="m9 18 6-6-6-6" /></svg>
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
                                    {t('tasks.previous')}
                                </Button>
                                <span className="text-sm font-medium text-muted-foreground">
                                    {t('tasks.pageOf', { current: currentPage, total: totalPages })}
                                </span>
                                <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
                                    disabled={currentPage === totalPages}
                                >
                                    {t('tasks.next')}
                                </Button>
                            </div>
                        )}
                    </>
                ) : (
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center">
                            <h3 className="font-semibold px-4 pt-3 pb-2 text-foreground/80">{t('tasks.visualRoadmap')}</h3>
                            <div className="text-sm text-muted-foreground font-medium capitalize">
                                {timeframe === 'all' ? t('tasks.entireProject') : `${timeframe} ${dayjs(filterDate + '-01').format('MMMM YYYY')}`} • {minDate.format('MMM D, YYYY')} - {maxDate.format('MMM D, YYYY')}
                            </div>
                        </div>
                        <div className="p-6 overflow-x-auto">
                            <div className="min-w-[800px] overflow-hidden relative">
                                {/* Vertical background grid lines */}
                                <div className="absolute top-6 bottom-0 w-full pointer-events-none z-0">
                                    {timelineMarkers.map((m, idx) => (
                                        <div key={`grid-${idx}`} className="absolute top-0 bottom-0 border-l border-muted-foreground/20" style={{ left: `${m.percent}%` }}></div>
                                    ))}
                                </div>

                                {/* Timeline markers */}
                                <div className="flex relative h-6 mb-4 border-b">
                                    <div className="absolute h-full text-[10px] font-medium text-muted-foreground left-0">
                                        {minDate.format('MMM D, YYYY')}
                                    </div>
                                    <div className="absolute h-full text-[10px] font-medium text-muted-foreground right-0">
                                        {maxDate.format('MMM D, YYYY')}
                                    </div>
                                    {timelineMarkers.map((m, idx) => (
                                        <div key={idx} className="absolute h-full border-l border-border text-[10px] font-medium text-muted-foreground pl-1" style={{ left: `${m.percent}%` }}>
                                            {m.label}
                                        </div>
                                    ))}
                                </div>
                                {/* Task bars container (clips overrun) */}
                                <div className="space-y-4 pb-2 relative z-10">
                                    {filteredTasks.map((task: any) => {
                                        const colors = getRoadmapColor(task.status);
                                        return (
                                            <DraggableTaskBar
                                                key={task.id}
                                                task={task}
                                                minDate={minDate}
                                                totalDays={totalDays}
                                                colors={colors}
                                                onUpdate={async (id, start, duration) => {
                                                    await db.tasks.update(id, { startDate: start, duration });
                                                }}
                                                onClick={() => onEditTask(task.id)}
                                            />
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
