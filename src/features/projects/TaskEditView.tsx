import { useState, useEffect } from 'react';
import { db, useLiveQuery, TaskStep } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';
import { DndContext, closestCenter, KeyboardSensor, PointerSensor, useSensor, useSensors } from '@dnd-kit/core';
import { arrayMove, SortableContext, sortableKeyboardCoordinates, verticalListSortingStrategy } from '@dnd-kit/sortable';
import { useSortable } from '@dnd-kit/sortable';
import { CSS } from '@dnd-kit/utilities';
import MDEditor from '@uiw/react-md-editor';

function SortableStepItem({ step, onUpdate, onDelete, t }: { step: TaskStep, onUpdate: (step: TaskStep) => void, onDelete: () => void, t: any }) {
    const {
        attributes,
        listeners,
        setNodeRef,
        transform,
        transition,
    } = useSortable({ id: step.id });

    const style = {
        transform: CSS.Transform.toString(transform),
        transition,
    };

    return (
        <div ref={setNodeRef} style={style} className="flex items-center gap-3 bg-background group relative z-10 w-full">
            <div {...attributes} {...listeners} className="cursor-grab hover:bg-muted p-1.5 rounded text-muted-foreground opacity-50 group-hover:opacity-100 transition-opacity flex-shrink-0 touch-none">
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="9" cy="12" r="1" /><circle cx="9" cy="5" r="1" /><circle cx="9" cy="19" r="1" /><circle cx="15" cy="12" r="1" /><circle cx="15" cy="5" r="1" /><circle cx="15" cy="19" r="1" /></svg>
            </div>
            <input
                type="checkbox"
                checked={step.completed}
                onChange={(e) => onUpdate({ ...step, completed: e.target.checked })}
                className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600 flex-shrink-0"
            />
            <input
                type="text"
                value={step.text}
                onChange={(e) => onUpdate({ ...step, text: e.target.value })}
                placeholder={t('taskEdit.stepPlaceholder')}
                className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${step.completed ? 'line-through text-muted-foreground' : ''}`}
            />
            <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={onDelete}
                className="text-muted-foreground hover:text-red-500 hover:bg-red-50 flex-shrink-0"
                title={t('taskEdit.deleteStep')}
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
            </Button>
        </div>
    );
}

export function TaskEditView({ taskId, onBack }: { taskId: string, onBack: () => void }) {
    const { t } = useTranslation();
    // Initial fetch of the task using live query to keep it reactive if updated elsewhere
    const task = useLiveQuery(() => db.tasks.get(taskId));

    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [editDurationUnit, setEditDurationUnit] = useState<'days' | 'weeks' | 'months'>('days');
    const [editProgress, setEditProgress] = useState('0');
    const [editStatus, setEditStatus] = useState<'backlog' | 'progress' | 'hold' | 'done'>('backlog');
    const [editSteps, setEditSteps] = useState<TaskStep[]>([]);

    const sensors = useSensors(
        useSensor(PointerSensor),
        useSensor(KeyboardSensor, {
            coordinateGetter: sortableKeyboardCoordinates,
        })
    );

    function handleDragEnd(event: any) {
        const { active, over } = event;

        if (active.id !== over?.id && over) {
            setEditSteps((items) => {
                const oldIndex = items.findIndex(i => i.id === active.id);
                const newIndex = items.findIndex(i => i.id === over.id);
                return arrayMove(items, oldIndex, newIndex);
            });
        }
    }

    // Populate local state once the task loads
    useEffect(() => {
        if (task) {
            // eslint-disable-next-line react-hooks/set-state-in-effect
            setEditTitle(task.title);
            setEditDescription(task.description || '');
            setEditStartDate(task.startDate);
            setEditDuration(task.duration.toString());
            setEditDurationUnit('days');
            setEditProgress(task.progress.toString());
            setEditStatus(task.status || 'backlog');
            try {
                setEditSteps(task.steps ? JSON.parse(task.steps) : []);
            } catch (e) {
                setEditSteps([]);
            }
        }
    }, [task]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTitle.trim()) return;

        let calculatedDuration = parseInt(editDuration, 10) || 1;
        if (editDurationUnit === 'months') {
            calculatedDuration = dayjs(editStartDate).add(calculatedDuration, 'month').diff(dayjs(editStartDate), 'day');
        } else if (editDurationUnit === 'weeks') {
            calculatedDuration *= 7;
        }

        await db.tasks.update(taskId, {
            title: editTitle.trim(),
            description: editDescription.trim(),
            startDate: editStartDate,
            duration: calculatedDuration,
            progress: parseInt(editProgress, 10) || 0,
            status: editStatus,
            steps: JSON.stringify(editSteps)
        });

        onBack();
    };

    if (!task) return <div>Loading...</div>;

    return (
        <div className="space-y-6 w-full animate-in fade-in duration-300">
            {/* Header: Back, Title, Actions */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div className="flex items-center gap-4">
                    <Button variant="outline" size="icon" onClick={onBack} className="shrink-0 bg-background/50 backdrop-blur-sm">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                    </Button>
                    <h2 className="text-2xl font-bold tracking-tight">{t('taskEdit.editTask')}</h2>
                </div>
                <div className="flex items-center gap-3">
                    <Button type="button" variant="ghost" onClick={onBack}>{t('taskEdit.cancel')}</Button>
                    <Button type="submit" form="task-edit-form" className="bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm ring-1 ring-indigo-600/20">{t('taskEdit.submitSave')}</Button>
                </div>
            </div>

            <form id="task-edit-form" onSubmit={handleSave} className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start pb-10">
                {/* Left Column (Main Content) */}
                <div className="lg:col-span-2 space-y-6">
                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
                        <div>
                            <label className="text-sm font-semibold mb-2 block">{t('taskEdit.title')}</label>
                            <input
                                required
                                type="text"
                                value={editTitle}
                                onChange={(e) => setEditTitle(e.target.value)}
                                className="flex h-11 w-full rounded-md border border-input bg-card px-4 py-2 text-base ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-shadow font-medium"
                            />
                        </div>

                        <div data-color-mode="light" className="flex flex-col gap-2">
                            <label className="text-sm font-semibold block">{t('taskEdit.descriptionLabel')}</label>
                            <div className="border rounded-md overflow-hidden focus-within:ring-2 focus-within:ring-indigo-500 transition-shadow">
                                <MDEditor
                                    value={editDescription}
                                    onChange={(val) => setEditDescription(val || '')}
                                    minHeight={350}
                                    preview="edit"
                                    className="!border-0"
                                    visibleDragbar={false}
                                />
                            </div>
                        </div>
                    </div>

                    <div className="bg-card border rounded-xl p-6 shadow-sm">
                        <div className="flex items-center justify-between mb-4 border-b pb-4">
                            <label className="text-base font-semibold block">{t('taskEdit.steps')}</label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditSteps([...editSteps, { id: uuidv4(), text: '', completed: false }])}
                                className="bg-background/50"
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                                {t('taskEdit.addStep')}
                            </Button>
                        </div>

                        <div className="space-y-3">
                            <DndContext
                                sensors={sensors}
                                collisionDetection={closestCenter}
                                onDragEnd={handleDragEnd}
                            >
                                <SortableContext
                                    items={editSteps}
                                    strategy={verticalListSortingStrategy}
                                >
                                    {editSteps.map((step, index) => (
                                        <SortableStepItem
                                            key={step.id}
                                            step={step}
                                            t={t}
                                            onUpdate={(updated) => {
                                                const newSteps = [...editSteps];
                                                newSteps[index] = updated;
                                                setEditSteps(newSteps);
                                            }}
                                            onDelete={() => {
                                                setEditSteps(editSteps.filter(s => s.id !== step.id));
                                            }}
                                        />
                                    ))}
                                </SortableContext>
                            </DndContext>
                            {editSteps.length === 0 && (
                                <div className="text-center py-8 px-4 text-sm text-muted-foreground border-2 border-dashed rounded-lg bg-muted/10">
                                    No steps added yet. Add steps to create a timeline in your PDF.
                                </div>
                            )}
                        </div>
                    </div>
                </div>

                {/* Right Column (Sidebar / Metadata) */}
                <div className="space-y-6 lg:sticky lg:top-6">
                    <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
                        <h3 className="font-semibold text-base border-b pb-4 block">{t('templates.properties')}</h3>
                        
                        <div>
                            <label className="text-sm font-semibold mb-2 block text-muted-foreground">{t('taskEdit.status')}</label>
                            <select
                                value={editStatus}
                                onChange={(e) => setEditStatus(e.target.value as any)}
                                className="flex h-10 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                            >
                                <option value="backlog">{t('taskEdit.backlog')}</option>
                                <option value="progress">{t('taskEdit.inProgress')}</option>
                                <option value="hold">{t('taskEdit.onHold')}</option>
                                <option value="done">{t('taskEdit.done')}</option>
                            </select>
                        </div>

                        <div>
                            <label className="text-sm font-semibold mb-2 block text-muted-foreground">{t('taskEdit.startDate')}</label>
                            <input
                                required
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                            />
                        </div>
                        
                        <div>
                            <label className="text-sm font-semibold mb-2 block text-muted-foreground">{t('taskEdit.duration')}</label>
                            <div className="flex gap-2">
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    value={editDuration}
                                    onChange={(e) => setEditDuration(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                                />
                                <select
                                    value={editDurationUnit}
                                    onChange={(e) => setEditDurationUnit(e.target.value as any)}
                                    className="flex h-10 w-32 rounded-md border border-input bg-muted/30 px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 transition-colors"
                                >
                                    <option value="days">{t('taskEdit.days')}</option>
                                    <option value="weeks">{t('taskEdit.weeks')}</option>
                                    <option value="months">{t('taskEdit.months')}</option>
                                </select>
                            </div>
                        </div>

                        <div className="pt-2">
                            <div className="flex items-center justify-between mb-3">
                                <label className="text-sm font-semibold text-muted-foreground">
                                    {t('taskEdit.progressStatus', { progress: editProgress })}
                                </label>
                            </div>
                            <div className="flex items-center gap-4 rounded-md p-1">
                                <input
                                    type="range"
                                    min="0" max="100" step="5"
                                    value={editProgress}
                                    onChange={(e) => setEditProgress(e.target.value)}
                                    className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-indigo-600 focus:outline-none focus:ring-2 focus:ring-indigo-500/30"
                                />
                            </div>
                        </div>
                    </div>
                </div>
            </form>
        </div>
    );
}
