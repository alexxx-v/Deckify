import { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { db, useLiveQuery, Task, Project, TaskType } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { ExportModal } from '../pdf/ExportModal';
import { useTranslation } from 'react-i18next';
import { DraggableTaskBar } from '../projects/DraggableTaskBar';

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
    const [groupByProject, setGroupByProject] = useState<boolean>(() => {
        return localStorage.getItem('deckify_board_groupByProject') === 'true';
    });
    const [timeframe, setTimeframe] = useState<'all' | 'month' | 'quarter' | 'year'>(() => {
        return (localStorage.getItem('deckify_board_timeframe') as any) || 'month';
    });
    const [sortBy, setSortBy] = useState<'startDate' | 'status' | 'duration' | 'startDate_desc' | 'status_desc' | 'duration_desc'>(() => {
        return (localStorage.getItem('deckify_board_sortBy') as any) || 'startDate';
    });
    const [filterDate, setFilterDate] = useState(() => {
        return localStorage.getItem('deckify_board_filterDate') || dayjs().format('YYYY-MM');
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
        localStorage.setItem('deckify_board_groupByProject', groupByProject.toString());
    }, [groupByProject]);

    useEffect(() => {
        localStorage.setItem('deckify_board_timeframe', timeframe);
    }, [timeframe]);

    useEffect(() => {
        localStorage.setItem('deckify_board_sortBy', sortBy);
    }, [sortBy]);

    useEffect(() => {
        localStorage.setItem('deckify_board_filterDate', filterDate);
    }, [filterDate]);

    const board = useLiveQuery(() => db.boards.get(boardId));
    const boardTasks = useLiveQuery(() => db.boardTasks.getTasksForBoard(boardId), [boardId]) || [];
    const allProjects = useLiveQuery(() => db.projects.toArray()) || [];
    const allTasks = useLiveQuery(() => db.tasks.toArray()) || [];
    const allTaskTypes = useLiveQuery(() => db.taskTypes.toArray()) || [];

    // Filter tasks by timeframe
    const filteredBoardTasks = useMemo(() => {
        return (boardTasks || []).filter((t: any) => {
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

            return taskStart.isBefore(rangeEnd.add(1, 'day')) && taskEnd.isAfter(rangeStart.subtract(1, 'day'));
        });
    }, [boardTasks, timeframe, filterDate]);

    // Grouping logic helper: Group by Project AND Task Type
    const groupedTasks = useMemo(() => {
        if (!groupByProject) return null;
        const groups: Record<string, Record<string, any[]>> = {};
        
        filteredBoardTasks.forEach(task => {
            if (!groups[task.projectId]) groups[task.projectId] = {};
            const typeKey = task.taskTypeId || 'none';
            if (!groups[task.projectId][typeKey]) groups[task.projectId][typeKey] = [];
            groups[task.projectId][typeKey].push(task);
        });
        return groups;
    }, [filteredBoardTasks, groupByProject]);

    // Get project name
    const getProjectName = (projectId: string) => {
        const project = allProjects.find((p: Project) => p.id === projectId);
        return project?.name || '';
    };

    // Get task type name
    const getTaskTypeName = (typeId: string) => {
        if (typeId === 'none') return t('tasks.noType', 'No Type');
        const type = allTaskTypes.find((tt: TaskType) => tt.id === typeId);
        return type?.name || t('tasks.noType', 'No Type');
    };

    // Sort tasks
    const sortedTasks = useMemo(() => {
        return [...filteredBoardTasks].sort((a: any, b: any) => {
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
    }, [filteredBoardTasks, sortBy]);

    const pageSize = 10;
    const totalTasks = sortedTasks.length;
    const totalPages = Math.ceil(totalTasks / pageSize);
    const paginatedTasks = useMemo(() => {
        return sortedTasks.slice((currentPage - 1) * pageSize, currentPage * pageSize);
    }, [sortedTasks, currentPage, pageSize]);

    if (currentPage > totalPages && totalPages > 0) {
        setCurrentPage(totalPages);
    }

    // Roadmap calculations
    const { minDate, maxDate, totalDays, timelineMarkers } = useMemo(() => {
        let min = dayjs(), max = dayjs();
        if (timeframe === 'all') {
            if (sortedTasks.length > 0) {
                min = dayjs(sortedTasks[0].startDate);
                max = min.add(sortedTasks[0].duration, 'day');
                sortedTasks.forEach((t: any) => {
                    const s = dayjs(t.startDate);
                    const e = s.add(t.duration, 'day');
                    if (s.isBefore(min)) min = s;
                    if (e.isAfter(max)) max = e;
                });
            }
        } else {
            const baseDate = dayjs(filterDate + '-01');
            if (timeframe === 'month') {
                min = baseDate.startOf('month');
                max = baseDate.endOf('month');
            } else if (timeframe === 'quarter') {
                const sm = Math.floor(baseDate.month() / 3) * 3;
                min = baseDate.month(sm).startOf('month');
                max = min.add(2, 'month').endOf('month');
            } else if (timeframe === 'year') {
                min = baseDate.startOf('year');
                max = baseDate.endOf('year');
            }
        }
        const diff = Math.max(1, max.diff(min, 'day'));
        
        const markers: Array<{ label: string, percent: number }> = [];
        let curr = min.startOf('month');
        if (curr.isBefore(min) || curr.isSame(min, 'day')) curr = curr.add(1, 'month');
        while (curr.isBefore(max)) {
            const percent = (curr.diff(min, 'day') / diff) * 100;
            if (percent > 2 && percent < 98) {
                markers.push({ label: curr.format('MMM YYYY'), percent });
            }
            curr = curr.add(1, 'month');
        }
        return { minDate: min, maxDate: max, totalDays: diff, timelineMarkers: markers };
    }, [sortedTasks, timeframe, filterDate]);

    const handleAddTask = async (taskId: string) => {
        await db.boardTasks.add({ id: uuidv4(), boardId, taskId, addedAt: Date.now() });
    };

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

    const boardTaskIds = new Set(boardTasks.map((t: Task) => t.id));
    const projectTasksForModal = allTasks.filter((t: Task) => {
        if (selectedProjectFilter && t.projectId !== selectedProjectFilter) return false;
        if (taskSearch && !t.title.toLowerCase().includes(taskSearch.toLowerCase())) return false;
        return true;
    });

    const boardAsProject = board ? { id: board.id, name: board.name, createdAt: board.createdAt } : null;

    if (!board) return <div>Loading board...</div>;

    return (
        <div className="space-y-6">
            <div className="flex flex-col gap-6">
                <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                        <Button variant="outline" size="icon" onClick={onBack} className="shrink-0">
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                        </Button>
                        {isEditingBoardName ? (
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
                        ) : (
                            <div className="flex items-center gap-2 group cursor-pointer" onClick={() => { setEditBoardName(board.name); setIsEditingBoardName(true); }}>
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
                            variant={groupByProject ? "default" : "outline"}
                            size="icon"
                            onClick={() => setGroupByProject(!groupByProject)}
                            className={groupByProject ? "bg-indigo-100 text-indigo-700 border-indigo-200 hover:bg-indigo-200" : ""}
                        >
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M12 2v10" /><path d="M18.42 15.61a2.1 2.1 0 0 1 2.97 2.97L16.95 23 13 19.05l4.44-4.44a2.1 2.1 0 0 1 2.98 0z" /><path d="m5 4 7 7-7 7" /></svg>
                        </Button>
                        <Button variant="default" className="bg-indigo-600 hover:bg-indigo-700" onClick={() => setShowExportModal(true)} disabled={boardTasks.length === 0}>
                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" /><polyline points="7 10 12 15 17 10" /><line x1="12" x2="12" y1="15" y2="3" /></svg>
                            {t('boards.exportPdf')}
                        </Button>
                    </div>
                </div>

                <div className="flex flex-col sm:flex-row items-baseline sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-2 bg-muted p-1 rounded-lg">
                        <input type="month" value={filterDate} onChange={(e) => setFilterDate(e.target.value)} disabled={timeframe === 'all'} className={`h-7 px-2 text-xs rounded-md border-0 bg-background shadow-sm ${timeframe === 'all' ? 'opacity-50' : ''}`} />
                        <div className="h-4 w-px bg-border mx-1"></div>
                        {(['all', 'year', 'quarter', 'month'] as const).map(f => (
                            <button key={f} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${timeframe === f ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setTimeframe(f)}>{t(`tasks.${f === 'all' ? 'allTime' : f}`)}</button>
                        ))}
                    </div>
                    <div className="flex items-center gap-2">
                        <div className="bg-muted p-1 rounded-lg flex border">
                            <select value={sortBy} onChange={(e) => setSortBy(e.target.value as any)} className="h-7 pl-2 pr-6 text-xs font-semibold rounded-md border-0 bg-transparent focus:ring-0 text-muted-foreground hover:text-foreground cursor-pointer">
                                {(['startDate', 'startDate_desc', 'status', 'status_desc', 'duration', 'duration_desc'] as const).map(s => (
                                    <option key={s} value={s}>{t(`tasks.sortBy${s.charAt(0).toUpperCase() + s.slice(1).replace('_desc', 'Desc')}`)}</option>
                                ))}
                            </select>
                        </div>
                        <div className="flex bg-muted p-1 rounded-lg border">
                            {(['list', 'roadmap'] as const).map(m => (
                                <button key={m} className={`px-3 py-1 text-xs font-semibold rounded-md transition-colors ${viewMode === m ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`} onClick={() => setViewMode(m)}>{t(`tasks.${m}`)}</button>
                            ))}
                        </div>
                    </div>
                </div>
            </div>

            {showAddTaskModal && createPortal(
                <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4">
                    <div className="bg-card w-full max-w-2xl rounded-xl shadow-lg border p-6 flex flex-col max-h-[80vh]">
                        <div className="flex justify-between items-center mb-4">
                            <h2 className="text-xl font-bold">{t('boards.addTaskFromProject')}</h2>
                            <button onClick={() => setShowAddTaskModal(false)} className="text-muted-foreground hover:text-foreground">
                                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="flex gap-3 mb-4">
                            <select value={selectedProjectFilter} onChange={(e) => setSelectedProjectFilter(e.target.value)} className="flex h-10 w-48 rounded-md border border-input bg-background px-3 py-2 text-sm">
                                <option value="">{t('boards.allProjects')}</option>
                                {allProjects.map((p: Project) => <option key={p.id} value={p.id}>{p.name}</option>)}
                            </select>
                            <div className="relative flex-1">
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground"><circle cx="11" cy="11" r="8" /><path d="m21 21-4.3-4.3" /></svg>
                                <input type="text" placeholder={t('boards.searchTasks')} value={taskSearch} onChange={(e) => setTaskSearch(e.target.value)} className="flex h-10 w-full rounded-md border border-input bg-background pl-10 pr-3 py-2 text-sm" />
                            </div>
                        </div>
                        <div className="overflow-y-auto flex-1">
                            {projectTasksForModal.length === 0 ? <div className="text-center text-muted-foreground py-12 text-sm">{t('tasks.noTasks')}</div> : (
                                <div className="space-y-1">
                                    {projectTasksForModal.map((task: Task) => {
                                        const isOnBoard = boardTaskIds.has(task.id);
                                        return (
                                            <div key={task.id} className={`flex items-center justify-between px-3 py-3 rounded-lg ${isOnBoard ? 'bg-muted/50 opacity-60' : 'hover:bg-muted/50 cursor-pointer'}`}>
                                                <div className="flex-1 min-w-0 mr-4">
                                                    <div className="flex items-center gap-2">
                                                        <h4 className="font-medium text-sm truncate">{task.title}</h4>
                                                        <span className={`px-1.5 py-0.5 rounded text-[9px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                                                            {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                                                        </span>
                                                    </div>
                                                    <p className="text-xs text-muted-foreground mt-0.5 truncate">
                                                        {t('boards.fromProject')} <span className="font-medium">{getProjectName(task.projectId)}</span> · {dayjs(task.startDate).format('MMM D, YYYY')}
                                                    </p>
                                                </div>
                                                {isOnBoard ? <span className="text-xs text-muted-foreground bg-muted px-2 py-1 rounded-md">{t('boards.taskAlreadyAdded')}</span> : (
                                                    <Button size="sm" variant="outline" onClick={() => handleAddTask(task.id)}>
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
                    </div>
                </div>,
                document.body
            )}

            <div className="mt-6">
                {((groupByProject ? Object.keys(groupedTasks || {}).length === 0 : sortedTasks.length === 0)) ? (
                    <div className="flex flex-col items-center justify-center p-12 mt-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/5">
                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M3 9h18" /><path d="M9 21V9" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold mb-1">{t('boards.noTasks')}</h3>
                        <p className="text-sm text-muted-foreground mb-6">{t('boards.noTasksHint')}</p>
                        <Button onClick={() => setShowAddTaskModal(true)} variant="secondary">{t('boards.addTaskFromProject')}</Button>
                    </div>
                ) : viewMode === 'list' ? (
                    <div className="bg-card border rounded-xl shadow-sm overflow-hidden">
                        <div className="overflow-x-auto min-w-[900px]">
                            <div className="hidden sm:flex sm:items-center gap-x-2 px-4 py-3 text-xs font-semibold text-muted-foreground uppercase border-b bg-muted/10">
                                <div className="flex-1 min-w-[200px] pl-4">{t('taskEdit.title')}</div>
                                <div className="w-[130px] shrink-0">{t('boards.fromProject')}</div>
                                <div className="w-[110px] shrink-0">{t('taskEdit.startDate')}</div>
                                <div className="w-[110px] shrink-0">{t('taskEdit.endDate')}</div>
                                <div className="w-[90px] shrink-0 text-center">{t('taskEdit.progressStatus', 'Progress').replace(/\s*\(.*?\)/, '')}</div>
                                <div className="w-[130px] shrink-0 text-center pr-10">{t('taskEdit.status')}</div>
                            </div>
                            <div className="flex flex-col">
                                {groupByProject ? (
                                    Object.entries(groupedTasks || {}).map(([projectId, types]) => (
                                        <div key={projectId} className="flex flex-col">
                                            <div className="px-5 py-2 bg-muted/30 font-bold border-y text-[10px] uppercase tracking-wider flex items-center gap-2 text-primary sticky top-0 z-10 backdrop-blur-sm">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
                                                {getProjectName(projectId)}
                                            </div>
                                            {Object.entries(types).map(([typeId, tasks]) => (
                                                <div key={typeId} className="flex flex-col">
                                                    <div className="px-8 py-1.5 bg-muted/10 font-semibold border-b text-[9px] uppercase tracking-wide flex items-center gap-2 text-muted-foreground/80">
                                                        <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 opacity-60"></div>
                                                        {getTaskTypeName(typeId)}
                                                        <span className="ml-auto text-[8px] opacity-60 font-normal tabular-nums">{tasks.length} {t('tasks.tasksCount')}</span>
                                                    </div>
                                                    {tasks.map((task, idx) => (
                                                        <TaskRow 
                                                            key={task.id} 
                                                            task={task} 
                                                            projectName={getProjectName(task.projectId)} 
                                                            onEdit={onEditTask} 
                                                            onRemove={handleRemoveTask} 
                                                            isLast={idx === tasks.length - 1} 
                                                            t={t} 
                                                        />
                                                    ))}
                                                </div>
                                            ))}
                                        </div>
                                    ))
                                ) : (
                                    paginatedTasks.map((task: any, idx: number) => (
                                        <TaskRow key={task.id} task={task} projectName={getProjectName(task.projectId)} onEdit={onEditTask} onRemove={handleRemoveTask} isLast={idx === paginatedTasks.length - 1} t={t} />
                                    ))
                                )}
                            </div>
                        </div>
                        {!groupByProject && totalPages > 1 && (
                            <div className="px-4 py-3 flex items-center justify-between border-t bg-muted/5">
                                <div className="text-xs text-muted-foreground">
                                    {t('common.showing')} <span className="font-medium">{(currentPage - 1) * pageSize + 1}</span> - <span className="font-medium">{Math.min(currentPage * pageSize, totalTasks)}</span> {t('common.of')} <span className="font-medium">{totalTasks}</span>
                                </div>
                                <div className="flex items-center gap-1">
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.max(1, p - 1))} disabled={currentPage === 1}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                                    </Button>
                                    <div className="flex items-center gap-1 mx-2">
                                        {Array.from({ length: totalPages }, (_, i) => i + 1).map(page => (
                                            <button key={page} onClick={() => setCurrentPage(page)} className={`w-8 h-8 text-xs font-medium rounded-md ${currentPage === page ? 'bg-primary text-primary-foreground' : 'hover:bg-muted text-muted-foreground'}`}>{page}</button>
                                        ))}
                                    </div>
                                    <Button variant="outline" size="icon" className="h-8 w-8" onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))} disabled={currentPage === totalPages}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m9 18 6-6-6-6" /></svg>
                                    </Button>
                                </div>
                            </div>
                        )}
                    </div>
                ) : (
                    <div className="bg-card border rounded-xl overflow-hidden shadow-sm">
                        <div className="px-6 py-4 border-b bg-muted/30 flex justify-between items-center">
                            <h3 className="font-semibold text-foreground/80">{t('tasks.visualRoadmap')}</h3>
                            <div className="text-sm text-muted-foreground font-medium">{minDate.format('MMM D, YYYY')} - {maxDate.format('MMM D, YYYY')}</div>
                        </div>
                        <div className="flex-1 overflow-x-auto p-4 lg:p-6 scrollbar-thin">
                            <div className="min-w-[1000px] flex flex-col relative">
                                <div className="absolute top-10 bottom-0 w-full flex pointer-events-none z-0">
                                    <div className="w-[25%] min-w-[300px] shrink-0 border-r bg-white dark:bg-slate-900 sticky left-0 z-40"></div>
                                    <div className="flex-1 relative overflow-hidden">
                                        {timelineMarkers.map((m, idx) => <div key={idx} className="absolute top-0 bottom-0 border-l border-muted-foreground/20" style={{ left: `${m.percent}%` }}></div>)}
                                    </div>
                                </div>
                                <div className="flex sticky top-0 z-[60] bg-white dark:bg-slate-900 border-b h-10 mb-4 shrink-0">
                                    <div className="w-[25%] min-w-[300px] sticky left-0 z-[70] bg-white dark:bg-slate-900 shrink-0 flex items-end pb-1 px-5 text-[10px] font-medium text-muted-foreground uppercase border-r">
                                        <div className="flex-1 truncate pr-2">{t('taskEdit.title')}</div>
                                        <div className="w-24 text-right shrink-0">{t('taskEdit.status')}</div>
                                    </div>
                                    <div className="flex-1 relative flex items-center overflow-hidden">
                                        <div className="absolute h-full text-[10px] left-2 flex items-center text-muted-foreground">{minDate.format('MMM D')}</div>
                                        <div className="absolute h-full text-[10px] right-2 flex items-center text-muted-foreground">{maxDate.format('MMM D')}</div>
                                        {timelineMarkers.map((m, idx) => <div key={idx} className="absolute h-full border-l border-border text-[10px] pl-1 flex items-center text-muted-foreground" style={{ left: `${m.percent}%` }}>{m.label}</div>)}
                                    </div>
                                </div>
                                <div className="flex flex-col gap-2 relative z-10">
                                    {groupByProject ? (
                                        Object.entries(groupedTasks || {}).map(([projectId, types]) => (
                                            <div key={projectId} className="flex flex-col gap-1.5 mb-4 last:mb-0">
                                                <div className="flex sticky top-10 left-0 z-[65] h-6 -ml-4 -mr-4 px-4 bg-muted/40 items-center justify-between border-y backdrop-blur-md">
                                                    <div className="flex items-center gap-1.5 font-bold text-[9px] uppercase tracking-wider text-primary ml-10">
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="10" height="10" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
                                                        {getProjectName(projectId)}
                                                    </div>
                                                </div>
                                                {Object.entries(types).map(([typeId, tasks]) => (
                                                    <div key={typeId} className="flex flex-col gap-1.5 mb-2 last:mb-0">
                                                        <div className="flex sticky top-[64px] left-0 z-[64] h-5 -ml-4 px-8 items-center gap-2 bg-muted/20 border-b">
                                                            <div className="w-1 h-1 rounded-full bg-indigo-400/50"></div>
                                                            <span className="text-[8px] font-semibold uppercase tracking-wide text-muted-foreground/70">{getTaskTypeName(typeId)}</span>
                                                            <span className="text-[7px] font-medium opacity-50 tabular-nums ml-auto mr-4">{tasks.length} {t('tasks.tasksCount')}</span>
                                                        </div>
                                                        {tasks.map((task: any) => <RoadmapTaskRow key={task.id} task={task} minDate={minDate} totalDays={totalDays} onEdit={onEditTask} t={t} />)}
                                                    </div>
                                                ))}
                                            </div>
                                        ))
                                    ) : (
                                        sortedTasks.map((task: any) => <RoadmapTaskRow key={task.id} task={task} minDate={minDate} totalDays={totalDays} onEdit={onEditTask} t={t} />)
                                    )}
                                </div>
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {showExportModal && boardAsProject && (
                <ExportModal project={boardAsProject} tasks={boardTasks} onClose={() => setShowExportModal(false)} />
            )}
        </div>
    );
}

// --- Helpers ---

function TaskRow({ task, projectName, onEdit, onRemove, isLast, t }: any) {
    return (
        <div onClick={() => onEdit(task.id, task.projectId)} className={`px-4 py-3 cursor-pointer flex flex-col sm:flex-row sm:items-center gap-x-2 group hover:bg-muted/50 transition-colors relative ${!isLast ? 'border-b border-border/20' : ''}`}>
            <div className="flex-1 min-w-[200px] flex flex-col gap-1 pl-4 pr-4">
                <h4 className="font-medium text-foreground group-hover:text-primary transition-colors leading-tight break-words">{task.title}</h4>
            </div>
            <div className="hidden sm:block w-[130px] shrink-0 text-sm text-muted-foreground truncate" title={projectName}>
                <span className="inline-flex items-center gap-1">
                    <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="opacity-50"><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
                    {projectName}
                </span>
            </div>
            <div className="hidden sm:block w-[110px] shrink-0 text-sm text-foreground/80">{dayjs(task.startDate).format('MMM D, YYYY')}</div>
            <div className="hidden sm:block w-[110px] shrink-0 text-sm text-foreground/80">{dayjs(task.startDate).add(task.duration, 'day').format('MMM D, YYYY')}</div>
            <div className="hidden sm:block w-[90px] shrink-0 text-center font-semibold text-sm text-muted-foreground group-hover:text-foreground">{task.progress}%</div>
            <div className="flex items-center justify-between sm:justify-center shrink-0 w-[130px] pl-4 sm:pl-0 sm:pr-10">
                <span className={`w-28 justify-center inline-flex items-center px-2 py-1 rounded-md text-[10px] uppercase font-bold border ${getStatusBadgeClass(task.status)}`}>
                    {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                </span>
            </div>
            <div className="absolute right-2.5 top-1/2 -translate-y-1/2 hidden sm:flex items-center gap-1">
                <button onClick={(e) => { e.stopPropagation(); onRemove(task.id, task.title); }} className="opacity-0 group-hover:opacity-100 transition-opacity text-muted-foreground hover:text-destructive p-0.5 rounded-md hover:bg-destructive/10">
                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                </button>
            </div>
        </div>
    );
}

function RoadmapTaskRow({ task, minDate, totalDays, onEdit, t }: any) {
    return (
        <div className="flex min-h-8 group">
            <div className="w-[25%] min-w-[300px] sticky left-0 z-50 bg-white dark:bg-slate-900 flex items-start text-sm cursor-pointer border-r pr-3 pl-5 py-1" onClick={() => onEdit(task.id, task.projectId)}>
                <div className="flex-1 min-w-0 font-medium text-foreground group-hover:text-primary leading-tight break-words pr-3" title={task.title}>{task.title}</div>
                <div className="w-24 shrink-0 justify-end flex">
                    <span className={`px-2 py-0.5 rounded text-[9px] uppercase font-bold border whitespace-nowrap ${getStatusBadgeClass(task.status)}`}>
                        {task.status ? t(`taskEdit.${task.status === 'progress' ? 'inProgress' : task.status === 'hold' ? 'onHold' : task.status}`) : t('taskEdit.backlog')}
                    </span>
                </div>
            </div>
            <div className="flex-1 relative overflow-hidden py-1">
                <div className="absolute inset-x-0 top-[15px] h-[1px] bg-border/20 z-0"></div>
                <DraggableTaskBar
                    task={task}
                    minDate={minDate}
                    totalDays={totalDays}
                    colors={getRoadmapColor(task.status)}
                    onUpdate={async (id, start, duration) => { await db.tasks.update(id, { startDate: start, duration }); }}
                    onClick={() => onEdit(task.id, task.projectId)}
                />
            </div>
        </div>
    );
}

function getStatusBadgeClass(status?: string) {
    switch (status) {
        case 'done': return 'bg-green-100 text-green-800 border-green-200';
        case 'progress': return 'bg-blue-100 text-blue-800 border-blue-200';
        case 'hold': return 'bg-yellow-100 text-yellow-800 border-yellow-200';
        default: return 'bg-gray-100 text-gray-800 border-gray-200';
    }
}

function getRoadmapColor(status?: string) {
    switch (status) {
        case 'done': return { bg: 'rgba(34, 197, 94, 0.15)', border: 'rgb(34, 197, 94)', fill: 'rgba(34, 197, 94, 0.4)' };
        case 'progress': return { bg: 'rgba(59, 130, 246, 0.15)', border: 'rgb(59, 130, 246)', fill: 'rgba(59, 130, 246, 0.4)' };
        case 'hold': return { bg: 'rgba(234, 179, 8, 0.15)', border: 'rgb(234, 179, 8)', fill: 'rgba(234, 179, 8, 0.4)' };
        default: return { bg: 'rgba(107, 114, 128, 0.15)', border: 'rgb(107, 114, 128)', fill: 'rgba(107, 114, 128, 0.4)' };
    }
}
