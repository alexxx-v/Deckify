import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { db, useLiveQuery, Task, Project } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { ExportModal } from '../pdf/ExportModal';
import { useTranslation } from 'react-i18next';
import { DraggableTaskBar } from '../projects/DraggableTaskBar';

const getStatusBadgeClass = (status?: string) => {
    switch (status) {
        case 'done': return 'bg-green-100 text-green-800 border-green-200';
        case 'progress': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'hold': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        case 'backlog':
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
};

const getRoadmapColor = (status?: string) => {
    switch (status) {
        case 'done': return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.4)' };
        case 'progress': return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.4)' };
        case 'hold': return { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgb(234, 179, 8)', fill: 'rgba(234, 179, 8, 0.4)' };
        case 'backlog':
        default: return { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgb(107, 114, 128)', fill: 'rgba(107, 114, 128, 0.4)' };
    }
};

interface BoardTasksProps {
    boardId: string;
    onBack: () => void;
    onEditTask: (taskId: string, projectId: string) => void;
}

export function BoardTasks({ boardId, onBack, onEditTask }: BoardTasksProps) {
    const { t } = useTranslation();
    const [showExportModal, setShowExportModal] = useState(false);
    const [showAddTaskModal, setShowAddTaskModal] = useState(false);
    const [viewMode, setViewMode] = useState<'list' | 'roadmap'>(() => {
        return (localStorage.getItem('deckify_board_viewMode') as any) || 'list';
    });
    const [sortBy, setSortBy] = useState<'startDate' | 'status' | 'duration' | 'startDate_desc' | 'status_desc' | 'duration_desc'>(() => {
        return (localStorage.getItem('deckify_board_sortBy') as any) || 'startDate';
    });
    const [currentPage, setCurrentPage] = useState(1);
    const [isEditingBoardName, setIsEditingBoardName] = useState(false);
    const [editBoardName, setEditBoardName] = useState('');

    // Add task modal state
    const [selectedProjectFilter, setSelectedProjectFilter] = useState<string>('');
    const [taskSearch, setTaskSearch] = useState('');

    useEffect(() => {
        localStorage.setItem('deckify_board_viewMode', viewMode);
    }, [viewMode]);

    useEffect(() => {
        localStorage.setItem('deckify_board_sortBy', sortBy);
    }, [sortBy]);

    const board = useLiveQuery(() => db.boards.get(boardId));
    const boardTasks = useLiveQuery(() => db.boardTasks.getTasksForBoard(boardId), [boardId]) || [];
    const allProjects = useLiveQuery(() => db.projects.toArray()) || [];
    const allTasks = useLiveQuery(() => db.tasks.toArray()) || [];

    // Get project name for a task
    const getProjectName = (projectId: string) => {
        const project = allProjects.find((p: Project) => p.id === projectId);
        return project?.name || '';
    };

    // Sort tasks
    const sortedTasks = [...boardTasks].sort((a: any, b: any) => {
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
    const totalTasks = sortedTasks.length;
    const totalPages = Math.ceil(totalTasks / pageSize);
    const paginatedTasks = sortedTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);

    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }

    // Roadmap calculations
    let minDate = dayjs(), maxDate = dayjs();
    if (sortedTasks.length > 0) {
        minDate = dayjs(sortedTasks[0].startDate);
        maxDate = minDate;
        sortedTasks.forEach((t: any) => {
            const start = dayjs(t.startDate);
            const end = dayjs(t.startDate).add(t.duration, 'day');
            if (start.isBefore(minDate)) minDate = start;
            if (end.isAfter(maxDate)) maxDate = end;
        });
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

    // Add task to board
    const handleAddTask = async (taskId: string) => {
        await db.boardTasks.add({
            id: uuidv4(),
            boardId,
            taskId,
            addedAt: Date.now(),
        });
    };

    // Remove task from board
    const handleRemoveTask = async (taskId: string, taskTitle: string) => {
        if (!confirm(t('boards.removeFromBoardConfirm', { name: taskTitle }))) return;
        await db.boardTasks.remove(boardId, taskId);
    };

    const handleSaveBoardName = async () => {
        if (!editBoardName.trim() || editBoardName === board?.name) {
            setIsEditingBoardName(false);
            return;
        }
        await db.boards.update(boardId, { name: editBoardName.trim() });
        setIsEditingBoardName(false);
    };

    const handleEditBoardNameClick = () => {
        setEditBoardName(board?.name || '');
        setIsEditingBoardName(true);
    };

    // Tasks available in "add task" modal
    const boardTaskIds = new Set(boardTasks.map((t: Task) => t.id));
    const projectTasksForModal = allTasks.filter((t: Task) => {
        if (selectedProjectFilter && t.projectId !== selectedProjectFilter) return false;
        if (taskSearch && !t.title.toLowerCase().includes(taskSearch.toLowerCase())) return false;
        return true;
    });

    // Create a virtual project for export modal
    const boardAsProject = board ? { id: board.id, name: board.name, createdAt: board.createdAt } : null;

    if (!board) return <div>Loading board...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                {/* Header Row */}
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={onBack} className="shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </Button>
                        {isEditingBoardName ? (
                            <div className="flex items-center gap-2">
                                <input
                                    type="text"
                                    value={editBoardName}
                                    onChange={(e) => setEditBoardName(e.target.value)}
                                    onBlur={handleSaveBoardName}
                                    onKeyDown={(e) => {
                                        if (e.key === 'Enter') handleSaveBoardName();
                                        if (e.key === 'Escape') setIsEditingBoardName(false);
                                    }}
                                    autoFocus
                                    className="flex h-10 w-full sm:w-[300px] rounded-md border border-input bg-background px-3 py-2 text-xl font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                        ) : (
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={handleEditBoardNameClick} title="Edit Board Name">
                                <div className="w-8 h-8 rounded-lg bg-indigo-50 flex items-center justify-center text-indigo-600 shrink-0">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                                </div>
                                <h2 className="text-2xl font-bold line-clamp-1">{board.name}</h2>
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground shrink-0"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z" /><path d="m15 5 4 4" /></svg>
                            </div>
                        )}
                    </div>

                    <div className="flex items-center gap-3">
                        <Button variant="outline" onClick={() => setShowAddTaskModal(true)}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            {t('boards.addTaskFromProject')}
                        </Button>
                        <Button
                            variant="default"
                            className="bg-indigo-600 hover:bg-indigo-700 text-white"
                            onClick={() => setShowExportModal(true)}
                            disabled={boardTasks.length === 0}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                            {t('boards.exportPdf')}
                        </Button>
                    </div>
                </div>

                {/* Filter Row */}
                {sortedTasks.length > 0 && (
                    <div className="flex items-center justify-end gap-2">
                        <div className="bg-muted p-1 rounded-lg flex">
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
                )}
            </div>

            {/* Add Task from Project Modal */}
            {showAddTaskModal && createPortal(
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
                    <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border p-6 animate-in zoom-in-95 duration-200 max-h-[80vh] flex flex-col">
                        <div className="flex justify-between items-center mb-4 shrink-0">
                            <h2 className="text-xl font-bold">{t('boards.addTaskFromProject')}</h2>
                            <button onClick={() => { setShowAddTaskModal(false); setTaskSearch(''); setSelectedProjectFilter(''); }} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>

                        {/* Filters */}
                        <div className="flex gap-3 mb-4 shrink-0">
                            <select
                                value={selectedProjectFilter}
                                onChange={(e) => setSelectedProjectFilter(e.target.value)}
                                className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                <option value="">{t('boards.allProjects')}</option>
                                {allProjects.map((p: Project) => (
                                    <option key={p.id} value={p.id}>{p.name}</option>
                                ))}
                            </select>
                            <div className="relative flex-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                <input
                                    type="text"
                                    placeholder={t('boards.searchTasks')}
                                    value={taskSearch}
                                    onChange={(e) => setTaskSearch(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                            </div>
                        </div>

                        {/* Task List */}
                        <div className="overflow-y-auto flex-1 -mx-2">
                            {projectTasksForModal.length === 0 ? (
                                <div className="text-center text-muted-foreground py-12 text-sm">
                                    {t('tasks.noTasks')}
                                </div>
                            ) : (
                                <div className="space-y-1">
                                    {projectTasksForModal.map((task: Task) => {
                                        const isOnBoard = boardTaskIds.has(task.id);
                                        const projectName = getProjectName(task.projectId);
                                        return (
                                            <div
                                                key={task.id}
                                                className={`flex items-center justify-between px-3 py-3 rounded-lg transition-colors ${isOnBoard ? 'bg-muted/50 opacity-60' : 'hover:bg-muted/50 cursor-pointer'}`}
                                            >
                                                <div className="flex-1 min-w-0 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-medium text-sm truncate">{task.title}</h4>
                                                        <span className={`shrink-0 inline-flex items-center px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                                                            {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        {t('boards.fromProject')} <span className="font-medium">{projectName}</span> · {dayjs(task.startDate).format('MMM D, YYYY')} · {task.duration} {t('taskEdit.days')}
                                                    </p>
                                                </div>
                                                {isOnBoard ? (
                                                    <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md font-medium shrink-0">
                                                        {t('boards.taskAlreadyAdded')}
                                                    </span>
                                                ) : (
                                                    <Button
                                                        size="sm"
                                                        variant="outline"
                                                        onClick={() => handleAddTask(task.id)}
                                                        className="shrink-0"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                                                        {t('boards.addTask')}
                                                    </Button>
                                                )}
                                            </div>
                                        );
                                    })}
                                </div>
                            )}
                        </div>

                        <div className="pt-4 flex justify-end border-t mt-4 shrink-0">
                            <Button variant="outline" onClick={() => { setShowAddTaskModal(false); setTaskSearch(''); setSelectedProjectFilter(''); }}>
                                {t('boards.cancel')}
                            </Button>
                        </div>
                    </div>
                </div>
            , document.body)}

            {/* Task List / Roadmap */}
            <div className="mt-6">
                {sortedTasks.length === 0 ? (
                    <div className="flex flex-col items-center justify-center p-12 mt-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/5 animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">{t('boards.noTasks')}</h3>
                        <p className="text-sm text-muted-foreground max-w-sm text-balance mb-6">
                            {t('boards.noTasksHint')}
                        </p>
                        <Button onClick={() => setShowAddTaskModal(true)} variant="secondary" className="shadow-sm">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><line x1="12" y1="5" x2="12" y2="19"></line><line x1="5" y1="12" x2="19" y2="12"></line></svg>
                            {t('boards.addTaskFromProject')}
                        </Button>
                    </div>
                ) : viewMode === 'list' ? (
                    <>
                        <div className="bg-card border rounded-xl shadow-sm relative overflow-hidden">
                            <div className="overflow-x-auto">
                                <div className="min-w-[900px]">
                                    {/* Table Header Row */}
                                    <div className="hidden sm:flex sm:items-center gap-x-2 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase tracking-wider border-b bg-muted/10">
                                        <div className="flex-1 w-0 min-w-[200px] pl-4">{t('taskEdit.title')}</div>
                                        <div className="w-[140px] shrink-0">{t('boards.fromProject')}</div>
                                        <div className="w-[120px] shrink-0">{t('taskEdit.startDate')}</div>
                                        <div className="w-[100px] shrink-0">{t('taskEdit.duration')}</div>
                                        <div className="w-[100px] shrink-0 text-center">{t('taskEdit.progressStatus', 'Progress').replace(/\s*\(.*?\)/, '')}</div>
                                        <div className="w-[130px] shrink-0 text-center">{t('taskEdit.status')}</div>
                                        <div className="w-[40px] shrink-0"></div>
                                    </div>

                                    <div className="flex flex-col">
                                        {paginatedTasks.map((task: any, index: number) => {
                                            const projectName = getProjectName(task.projectId);
                                            return (
                                                <div
                                                    key={task.id}
                                                    className={`px-4 py-3 flex flex-col sm:flex-row sm:items-center gap-y-3 gap-x-2 group hover:bg-muted/50 transition-colors relative ${index !== paginatedTasks.length - 1 ? 'border-b border-border/50' : ''}`}
                                                >
                                                    <div
                                                        className="flex-1 w-0 min-w-[200px] flex items-center gap-4 pl-4 pr-4 cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                    >
                                                        <h4 className="font-medium truncate text-foreground group-hover:text-primary transition-colors">{task.title}</h4>
                                                    </div>

                                                    <div
                                                        className="hidden sm:block w-[140px] shrink-0 text-sm text-muted-foreground truncate cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                        title={projectName}
                                                    >
                                                        <span className="inline-flex items-center gap-1">
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="shrink-0 opacity-50"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
                                                            {projectName}
                                                        </span>
                                                    </div>

                                                    <div
                                                        className="hidden sm:block w-[120px] shrink-0 text-sm text-foreground/80 tabular-nums cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                    >
                                                        {dayjs(task.startDate).format('MMM D, YYYY')}
                                                    </div>
                                                    <div
                                                        className="hidden sm:block w-[100px] shrink-0 text-sm text-muted-foreground tabular-nums cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                    >
                                                        {task.duration} {t('taskEdit.days')}
                                                    </div>
                                                    <div
                                                        className="hidden sm:block w-[100px] shrink-0 text-center font-semibold text-sm tabular-nums text-muted-foreground group-hover:text-foreground transition-colors cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                    >
                                                        {task.progress}%
                                                    </div>

                                                    <div
                                                        className="flex items-center justify-between sm:justify-center shrink-0 w-[130px] cursor-pointer"
                                                        onClick={() => onEditTask(task.id, task.projectId)}
                                                    >
                                                        <span className={`w-28 justify-center inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                                                            {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                        </span>
                                                    </div>

                                                    {/* Remove from board button */}
                                                    <div className="w-[40px] shrink-0 flex justify-center">
                                                        <button
                                                            onClick={(e) => { e.stopPropagation(); handleRemoveTask(task.id, task.title); }}
                                                            className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-1 rounded-md hover:bg-destructive/10"
                                                            title={t('boards.removeFromBoard')}
                                                        >
                                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                                                        </button>
                                                    </div>
                                                </div>
                                            );
                                        })}
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
                    /* Roadmap View */
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center">
                            <h3 className="font-semibold px-4 pt-3 pb-2 text-foreground/80">{t('tasks.visualRoadmap')}</h3>
                            <div className="text-sm text-muted-foreground font-medium">
                                {minDate.format('MMM D, YYYY')} - {maxDate.format('MMM D, YYYY')}
                            </div>
                        </div>
                        <div className="flex flex-row relative items-stretch">
                            {/* Left Panel */}
                            <div className="hidden lg:flex w-[300px] shrink-0 bg-card border-r flex-col z-20 py-6">
                                <div className="flex items-end pb-1 h-6 mb-4 border-b px-5 text-[10px] font-medium text-muted-foreground uppercase">
                                    <div className="flex-1 truncate pr-2">{t('taskEdit.title')}</div>
                                    <div className="w-20 text-right shrink-0">{t('taskEdit.status')}</div>
                                </div>
                                <div className="space-y-2 pb-2 px-5">
                                    {sortedTasks.map((task: any) => (
                                        <div key={`sidebar-${task.id}`} className="h-8 flex items-center text-sm group cursor-pointer" onClick={() => onEditTask(task.id, task.projectId)}>
                                            <div className="flex-1 truncate font-medium text-foreground group-hover:text-primary pr-3" title={task.title}>{task.title}</div>
                                            <div className="w-24 shrink-0 justify-end flex">
                                                <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border whitespace-nowrap ${getStatusBadgeClass(task.status)}`}>
                                                    {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                </span>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>

                            {/* Right Timeline Panel */}
                            <div className="flex-1 overflow-x-auto p-6">
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
                                    {/* Task bars */}
                                    <div className="space-y-2 pb-2 relative z-10">
                                        {sortedTasks.map((task: any) => {
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
                                                    onClick={() => onEditTask(task.id, task.projectId)}
                                                />
                                            );
                                        })}
                                    </div>
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showExportModal && boardAsProject && (
                <ExportModal
                    project={boardAsProject}
                    tasks={boardTasks}
                    onClose={() => setShowExportModal(false)}
                />
            )}
        </div>
    );
}
