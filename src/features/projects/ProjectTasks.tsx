import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, useLiveQuery, TaskType } from '@/db/schema';
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

function TaskRow({ task, onEditTask, t, isLast, taskTypes, groupByType }: { task: any, onEditTask: (id: string) => void, t: any, isLast: boolean, taskTypes?: TaskType[], groupByType: boolean }) {
    const taskType = task.taskTypeId ? taskTypes?.find(tt => tt.id === task.taskTypeId) : null;

    return (
        <div
            onClick={() => onEditTask(task.id)}
            className={`px-4 py-3 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-y-3 gap-x-2 group hover:bg-muted/50 transition-colors relative ${!isLast ? 'border-b border-border/50' : ''}`}
        >
            <div className="flex-1 w-0 min-w-[200px] flex flex-col gap-1 pl-4 pr-4">
                <h4 className="font-medium text-foreground group-hover:text-primary transition-colors leading-tight break-words text-wrap">{task.title}</h4>
                {taskType && !groupByType && (
                    <div className="flex items-center gap-1.5">
                        <div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskType.color }}></div>
                        <span className="text-[10px] text-muted-foreground font-semibold uppercase">{taskType.name}</span>
                    </div>
                )}
            </div>

            <div className="hidden sm:block w-[120px] shrink-0 text-sm text-foreground/80 tabular-nums">
                {dayjs(task.startDate).format('MMM D, YYYY')}
            </div>
            <div className="hidden sm:block w-[120px] shrink-0 text-sm text-foreground/80 tabular-nums">
                {dayjs(task.startDate).add(task.duration, 'day').format('MMM D, YYYY')}
            </div>
            <div className="hidden sm:block w-[100px] shrink-0 text-sm text-muted-foreground tabular-nums">
                {task.duration} {t('taskEdit.days')}
            </div>
            <div className="hidden sm:block w-[100px] shrink-0 text-center font-semibold text-sm tabular-nums text-muted-foreground group-hover:text-foreground transition-colors">
                {task.progress}%
            </div>

            <div className="flex items-center justify-between sm:justify-center shrink-0 w-[130px] pl-4 sm:pl-0 sm:pr-8">
                <div className="sm:hidden text-xs text-muted-foreground flex gap-2">
                    <span className="font-semibold text-foreground">{task.progress}%</span>
                    <span className="opacity-50">•</span>
                    <span>{dayjs(task.startDate).format('MMM D')} - {dayjs(task.startDate).add(task.duration, 'day').format('MMM D')}</span>
                </div>
                <span className={`w-28 justify-center inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                    {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                </span>
            </div>

            <div className="absolute right-4 top-1/2 -translate-y-1/2 hidden sm:block">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-muted-foreground/30 group-hover:text-primary transition-colors"><path d="m9 18 6-6-6-6" /></svg>
            </div>
        </div>
    );
}

export function ProjectTasks({ projectId, onBack, onEditTask, onOpenSettings }: { projectId: string, onBack: () => void, onEditTask: (taskId: string) => void, onOpenSettings: () => void }) {
    const { t } = useTranslation();
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAddModal, setShowAddModal] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'roadmap'>(() => {
        return (localStorage.getItem('deckify_viewMode') as any) || 'list';
    });
    const [timeframe, setTimeframe] = useState<'all' | 'month' | 'quarter' | 'year'>(() => {
        return (localStorage.getItem('deckify_timeframe') as any) || 'month';
    });
    const [sortBy, setSortBy] = useState<'startDate' | 'status' | 'duration' | 'startDate_desc' | 'status_desc' | 'duration_desc'>(() => {
        return (localStorage.getItem('deckify_sortBy') as any) || 'startDate';
    });
    const [groupByType, setGroupByType] = useState<boolean>(() => {
        return localStorage.getItem('deckify_groupByType') === 'true';
    });
    const [filterDate, setFilterDate] = useState(() => {
        return localStorage.getItem('deckify_filterDate') || dayjs().format('YYYY-MM');
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [newTitle, setNewTitle] = useState('');
    const [newDescription, setNewDescription] = useState('');
    const [newStartDate, setNewStartDate] = useState(dayjs().format('YYYY-MM-DD'));
    const [newDuration, setNewDuration] = useState('5');
    const [newDurationUnit, setNewDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');
    const [newProgress, setNewProgress] = useState('0');
    const [newStatus, setNewStatus] = useState<'backlog' | 'progress' | 'hold' | 'done'>('backlog');
    const [newTaskTypeId, setNewTaskTypeId] = useState<string>('');

    const [isEditingProjectName, setIsEditingProjectName] = useState(false);
    const [editProjectName, setEditProjectName] = useState('');    // Removed inline editing state

    useEffect(() => {
        localStorage.setItem('deckify_viewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('deckify_timeframe', timeframe);
    }, [timeframe]);

    useEffect(() => {
        localStorage.setItem('deckify_sortBy', sortBy);
    }, [sortBy]);

    useEffect(() => {
        localStorage.setItem('deckify_groupByType', groupByType.toString());
    }, [groupByType]);

    useEffect(() => {
        localStorage.setItem('deckify_filterDate', filterDate);
    }, [filterDate]);


    const project = useLiveQuery(() => db.projects.get(projectId));
    const tasks = useLiveQuery(() => db.tasks.where('projectId').equals(projectId).sortBy('startDate'));
    const taskTypes = useLiveQuery(() => db.taskTypes.where('projectId').equals(projectId).toArray());

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
    }).sort((a: any, b: any) => {
        const isDesc = sortBy.endsWith('_desc');
        const sortType = sortBy.replace('_desc', '');
        let diff = 0;

        if (sortType === 'duration') {
            diff = a.duration - b.duration;
        } else if (sortType === 'status') {
            const statusOrder = { 'progress': 1, 'backlog': 2, 'hold': 3, 'done': 4 };
            const orderA = statusOrder[a.status as keyof typeof statusOrder] || 5;
            const orderB = statusOrder[b.status as keyof typeof statusOrder] || 5;
            if (orderA !== orderB) diff = orderA - orderB;
            else diff = dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf();
        } else {
            diff = dayjs(a.startDate).valueOf() - dayjs(b.startDate).valueOf();
        }

        return isDesc ? -diff : diff;
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
            progress: newStatus === 'done' ? 100 : (parseInt(newProgress, 10) || 0),
            status: newStatus,
            taskTypeId: newTaskTypeId || undefined
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
                    <div className="flex items-center gap-3">
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
                        <Button variant="outline" size="icon" onClick={onOpenSettings} title={t('settings.projectSettings', 'Project Settings')}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z" /><circle cx="12" cy="12" r="3" /></svg>
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

                    <div className="flex items-center gap-2">
                        <Button
                            variant={groupByType ? "default" : "outline"}
                            size="icon"
                            onClick={() => setGroupByType(!groupByType)}
                            title={t('tasks.groupByType', 'Группировать по типам')}
                            className={`h-9 w-9 ${groupByType ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200 hover:text-indigo-800" : ""}`}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10" /><path d="M18.42 15.61a2.1 2.1 0 0 1 2.97 2.97L16.95 23 13 19.05l4.44-4.44a2.1 2.1 0 0 1 2.98 0z" /><path d="m5 4 7 7-7 7" /></svg>
                        </Button>
                        <div className="bg-muted p-1 rounded-lg flex border">
                            <select
                                value={sortBy}
                                onChange={(e) => setSortBy(e.target.value as any)}
                                title={t('tasks.sortBy')}
                                className="h-7 pl-2 pr-6 text-xs font-semibold rounded-md border-0 bg-transparent focus:ring-0 text-muted-foreground hover:text-foreground cursor-pointer"
                            >
                                <option value="startDate">{t('tasks.sortByStartDate')}</option>
                                <option value="startDate_desc">{t('tasks.sortByStartDateDesc')}</option>
                                <option value="status">{t('tasks.sortByStatus')}</option>
                                <option value="status_desc">{t('tasks.sortByStatusDesc')}</option>
                                <option value="duration">{t('tasks.sortByDuration')}</option>
                                <option value="duration_desc">{t('tasks.sortByDurationDesc')}</option>
                            </select>
                        </div>
                        <div className="hidden sm:flex bg-muted p-1 rounded-lg flex-shrink-0">
                            <button
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setViewMode('list')}
                            >
                                {t('tasks.list')}
                            </button>
                            <button
                                className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === 'roadmap' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setViewMode('roadmap')}
                            >
                                {t('tasks.roadmap')}
                            </button>
                        </div>
                    </div>
                </div>
            </div>

            {showAddModal && createPortal(
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
                        <div className="flex justify-between items-center mb-6 shrink-0">
                            <h2 className="text-xl font-bold">{t('taskEdit.addTask')}</h2>
                            <button onClick={() => setShowAddModal(false)} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <form onSubmit={addTask} className="space-y-4 shrink-0">
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
                                        onChange={(e) => {
                                            const status = e.target.value as any;
                                            setNewStatus(status);
                                            if (status === 'done') {
                                                setNewProgress('100');
                                            }
                                        }}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="backlog">{t('taskEdit.backlog')}</option>
                                        <option value="progress">{t('taskEdit.inProgress')}</option>
                                        <option value="hold">{t('taskEdit.onHold')}</option>
                                        <option value="done">{t('taskEdit.done')}</option>
                                    </select>
                                </div>
                                <div>
                                    <label className="text-sm font-medium mb-1 block">{t('taskEdit.taskType', 'Тип задачи')}</label>
                                    <select
                                        value={newTaskTypeId}
                                        onChange={(e) => setNewTaskTypeId(e.target.value)}
                                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                    >
                                        <option value="">{t('taskEdit.noType', 'Без типа')}</option>
                                        {taskTypes?.map((tt: any) => (
                                            <option key={tt.id} value={tt.id}>{tt.name}</option>
                                        ))}
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
                , document.body)}

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
                        <div className="bg-card border rounded-xl shadow-sm relative overflow-hidden">
                            <div className="overflow-x-auto">
                                <div className="min-w-[800px]">
                                    {/* Table Header Row */}
                                    <div className="hidden sm:flex sm:items-center gap-x-2 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/10">
                                        <div className="flex-1 w-0 min-w-[200px] pl-4">{t('taskEdit.title')}</div>
                                        <div className="w-[120px] shrink-0">{t('taskEdit.startDate')}</div>
                                        <div className="w-[120px] shrink-0">{t('taskEdit.endDate', 'Дата завершения')}</div>
                                        <div className="w-[100px] shrink-0">{t('taskEdit.duration')}</div>
                                        <div className="w-[100px] shrink-0 text-center">{t('taskEdit.progressStatus', 'Прогресс').replace(/\s*\(.*?\)/, '')}</div>
                                        <div className="w-[130px] shrink-0 text-center pr-8">{t('taskEdit.status')}</div>
                                    </div>

                                    <div className="flex flex-col">
                                        {groupByType ? (
                                            (() => {
                                                const groups: Record<string, any[]> = { 'no-type': [] };
                                                taskTypes?.forEach((tt: TaskType) => groups[tt.id] = []);
                                                paginatedTasks.forEach((t: any) => {
                                                    if (t.taskTypeId && groups[t.taskTypeId]) {
                                                        groups[t.taskTypeId].push(t);
                                                    } else {
                                                        groups['no-type'].push(t);
                                                    }
                                                });

                                                const entries = Object.entries(groups).filter(([_, groupTasks]) => groupTasks.length > 0);

                                                return entries.map(([typeId, groupTasks], groupIndex) => {
                                                    const taskType = taskTypes?.find((tt: TaskType) => tt.id === typeId);
                                                    return (
                                                        <div key={typeId} className="flex flex-col">
                                                            <div className="bg-muted/30 px-4 py-1.5 border-b border-t first:border-t-0 flex items-center gap-2">
                                                                <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: taskType?.color || '#94a3b8' }}></div>
                                                                <span className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground pt-0.5">
                                                                    {taskType?.name || t('taskEdit.noType', 'Без типа')} ({groupTasks.length})
                                                                </span>
                                                            </div>
                                                            {groupTasks.map((task: any, index: number) => (
                                                                <TaskRow
                                                                    key={task.id}
                                                                    task={task}
                                                                    onEditTask={onEditTask}
                                                                    t={t}
                                                                    isLast={index === groupTasks.length - 1 && groupIndex === entries.length - 1}
                                                                    taskTypes={taskTypes}
                                                                    groupByType={groupByType}
                                                                />
                                                            ))}
                                                        </div>
                                                    );
                                                });
                                            })()
                                        ) : (
                                            paginatedTasks.map((task: any, index: number) => (
                                                <TaskRow
                                                    key={task.id}
                                                    task={task}
                                                    onEditTask={onEditTask}
                                                    t={t}
                                                    isLast={index === paginatedTasks.length - 1}
                                                    taskTypes={taskTypes}
                                                    groupByType={groupByType}
                                                />
                                            ))
                                        )}
                                    </div>
                                </div>
                            </div>
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
                        <div className="flex-1 overflow-x-auto p-4 lg:p-6 scrollbar-thin">
                            <div className="min-w-[1000px] flex flex-col relative">
                                {/* Grid background layer */}
                                <div className="absolute top-10 bottom-0 w-full flex pointer-events-none z-0">
                                    <div className="w-[25%] min-w-[300px] shrink-0 border-r bg-white dark:bg-slate-900 sticky left-0 z-40"></div>
                                    <div className="flex-1 relative overflow-hidden">
                                        {timelineMarkers.map((m, idx) => (
                                            <div key={`grid-${idx}`} className="absolute top-0 bottom-0 border-l border-muted-foreground/20" style={{ left: `${m.percent}%` }}></div>
                                        ))}
                                    </div>
                                </div>

                                {/* Header Row */}
                                <div className="flex sticky top-0 z-[60] bg-white dark:bg-slate-900 border-b h-10 mb-4 shrink-0">
                                    <div className="w-[25%] min-w-[300px] sticky left-0 z-[70] bg-white dark:bg-slate-900 shrink-0 flex items-end pb-1 px-5 text-[10px] font-medium text-muted-foreground uppercase border-r">
                                        <div className="flex-1 truncate pr-2">{t('taskEdit.title')}</div>
                                        <div className="w-20 text-right shrink-0">{t('taskEdit.status')}</div>
                                    </div>
                                    <div className="flex-1 relative flex items-center overflow-hidden bg-white/50 dark:bg-slate-900/50">
                                        <div className="absolute h-full text-[10px] font-medium text-muted-foreground left-2 flex items-center">{minDate.format('MMM D, YYYY')}</div>
                                        <div className="absolute h-full text-[10px] font-medium text-muted-foreground right-2 flex items-center">{maxDate.format('MMM D, YYYY')}</div>
                                        {timelineMarkers.map((m, idx) => (
                                            <div key={idx} className="absolute h-full border-l border-border text-[10px] font-medium text-muted-foreground pl-1 flex items-center" style={{ left: `${m.percent}%` }}>{m.label}</div>
                                        ))}
                                    </div>
                                </div>

                                {/* Tasks Rows */}
                                <div className="flex flex-col gap-2 relative z-10">
                                    {groupByType ? (
                                        (() => {
                                            const groups: Record<string, any[]> = { 'no-type': [] };
                                            taskTypes?.forEach((tt: TaskType) => groups[tt.id] = []);
                                            filteredTasks.forEach((t: any) => {
                                                if (t.taskTypeId && groups[t.taskTypeId]) {
                                                    groups[t.taskTypeId].push(t);
                                                } else {
                                                    groups['no-type'].push(t);
                                                }
                                            });

                                            const entries = Object.entries(groups).filter(([_, gt]) => gt.length > 0);

                                            return entries.map(([typeId, groupTasks]) => {
                                                const taskType: TaskType | undefined = taskTypes?.find((tt: TaskType) => tt.id === typeId);
                                                return (
                                                    <div key={`group-${typeId}`} className="flex flex-col">
                                                        <div className="flex sticky top-10 z-20">
                                                            <div className="w-[25%] min-w-[300px] sticky left-0 z-50 bg-white dark:bg-slate-900 px-5 py-1 border-b border-border/50 border-r">
                                                                <div className="flex items-center gap-2">
                                                                    <div className="w-2 h-2 rounded-full" style={{ backgroundColor: taskType?.color || '#94a3b8' }}></div>
                                                                    <span className="text-[10px] font-bold text-muted-foreground uppercase">{taskType?.name || t('taskEdit.noType', 'Без типа')}</span>
                                                                </div>
                                                            </div>
                                                            <div className="flex-1 border-b border-border/50 border-dashed"></div>
                                                        </div>
                                                        <div className="flex flex-col space-y-2 mt-2">
                                                            {groupTasks.map((task: any) => {
                                                                const colors = getRoadmapColor(task.status);
                                                                return (
                                                                    <div key={task.id} className="flex min-h-8 group">
                                                                        <div
                                                                            className="w-[25%] min-w-[300px] sticky left-0 z-50 bg-white dark:bg-slate-900 flex items-start text-sm cursor-pointer border-r pr-3 pl-5 py-1"
                                                                            onClick={() => onEditTask(task.id)}
                                                                        >
                                                                            <div className="flex-1 min-w-0 font-medium text-foreground group-hover:text-primary leading-tight break-words text-wrap pr-3 pt-0.5" title={task.title}>{task.title}</div>
                                                                            <div className="w-24 shrink-0 justify-end flex pt-0.5">
                                                                                <span className={`px-1.5 py-0.5 rounded text-[8px] uppercase font-bold border whitespace-nowrap ${getStatusBadgeClass(task.status)}`}>
                                                                                    {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                                                </span>
                                                                            </div>
                                                                        </div>
                                                                        <div className="flex-1 relative overflow-hidden py-1">
                                                                            <div className="absolute inset-x-0 top-[15px] -translate-y-[0.5px] h-[1px] bg-border/20 z-0"></div>
                                                                            <DraggableTaskBar
                                                                                task={task}
                                                                                minDate={minDate}
                                                                                totalDays={totalDays}
                                                                                colors={colors}
                                                                                onUpdate={async (id, start, duration) => {
                                                                                    await db.tasks.update(id, { startDate: start, duration });
                                                                                }}
                                                                                onClick={() => onEditTask(task.id)}
                                                                            />
                                                                        </div>
                                                                    </div>
                                                                );
                                                            })}
                                                        </div>
                                                    </div>
                                                );
                                            });
                                        })()
                                    ) : (
                                        filteredTasks.map((task: any) => {
                                            const colors = getRoadmapColor(task.status);
                                            return (
                                                <div key={task.id} className="flex min-h-8 group">
                                                    <div
                                                        className="w-[25%] min-w-[300px] sticky left-0 z-50 bg-white dark:bg-slate-900 flex items-start text-sm cursor-pointer border-r pr-3 pl-5 py-1"
                                                        onClick={() => onEditTask(task.id)}
                                                    >
                                                        <div className="flex-1 min-w-0 font-medium text-foreground group-hover:text-primary leading-tight break-words text-wrap pr-3 pt-0.5" title={task.title}>{task.title}</div>
                                                        <div className="w-24 shrink-0 justify-end flex pt-0.5">
                                                            <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border whitespace-nowrap ${getStatusBadgeClass(task.status)}`}>
                                                                {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                            </span>
                                                        </div>
                                                    </div>
                                                    <div className="flex-1 relative overflow-hidden py-1">
                                                        <div className="absolute inset-x-0 top-[15px] -translate-y-[0.5px] h-[1px] bg-border/20 z-0"></div>
                                                        <DraggableTaskBar
                                                            task={task}
                                                            minDate={minDate}
                                                            totalDays={totalDays}
                                                            colors={colors}
                                                            onUpdate={async (id, start, duration) => {
                                                                await db.tasks.update(id, { startDate: start, duration });
                                                            }}
                                                            onClick={() => onEditTask(task.id)}
                                                        />
                                                    </div>
                                                </div>
                                            );
                                        })
                                    )}
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
