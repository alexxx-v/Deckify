import { useState, useEffect } from 'react';
import { db, useLiveQuery, TaskStep } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import dayjs from 'dayjs';
import { useTranslation } from 'react-i18next';

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
        <div className="space-y-6 max-w-2xl mx-auto">
            <div className="flex items-center gap-4">
                <Button variant="outline" size="icon" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </Button>
                <h2 className="text-2xl font-bold">{t('taskEdit.editTask')}</h2>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <form onSubmit={handleSave} className="space-y-5">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">{t('taskEdit.title')}</label>
                        <input
                            required
                            type="text"
                            value={editTitle}
                            onChange={(e) => setEditTitle(e.target.value)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
                        <div>
                            <label className="text-sm font-medium mb-1.5 block">{t('taskEdit.startDate')}</label>
                            <input
                                required
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block">{t('taskEdit.duration')}</label>
                            <div className="flex gap-2">
                                <input
                                    required
                                    type="number"
                                    min="1"
                                    value={editDuration}
                                    onChange={(e) => setEditDuration(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                />
                                <select
                                    value={editDurationUnit}
                                    onChange={(e) => setEditDurationUnit(e.target.value as any)}
                                    className="flex h-10 w-32 rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    <option value="days">{t('taskEdit.days')}</option>
                                    <option value="weeks">{t('taskEdit.weeks')}</option>
                                    <option value="months">{t('taskEdit.months')}</option>
                                </select>
                            </div>
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">
                            {t('taskEdit.progressStatus', { progress: editProgress })}
                        </label>
                        <div className="flex items-center gap-4 border rounded-md p-3 bg-muted/20">
                            <input
                                type="range"
                                min="0" max="100" step="5"
                                value={editProgress}
                                onChange={(e) => setEditProgress(e.target.value)}
                                className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">{t('taskEdit.status')}</label>
                        <select
                            value={editStatus}
                            onChange={(e) => setEditStatus(e.target.value as any)}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        >
                            <option value="backlog">{t('taskEdit.backlog')}</option>
                            <option value="progress">{t('taskEdit.inProgress')}</option>
                            <option value="hold">{t('taskEdit.onHold')}</option>
                            <option value="done">{t('taskEdit.done')}</option>
                        </select>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">{t('taskEdit.descriptionLabel')}</label>
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={6}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        />
                    </div>

                    <div className="border-t pt-5 mt-5">
                        <div className="flex items-center justify-between mb-3">
                            <label className="text-sm font-medium block">{t('taskEdit.steps')}</label>
                            <Button
                                type="button"
                                variant="outline"
                                size="sm"
                                onClick={() => setEditSteps([...editSteps, { id: uuidv4(), text: '', completed: false }])}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                                {t('taskEdit.addStep')}
                            </Button>
                        </div>

                        <div className="space-y-3">
                            {editSteps.map((step, index) => (
                                <div key={step.id} className="flex items-center gap-3">
                                    <input
                                        type="checkbox"
                                        checked={step.completed}
                                        onChange={(e) => {
                                            const newSteps = [...editSteps];
                                            newSteps[index].completed = e.target.checked;
                                            setEditSteps(newSteps);
                                        }}
                                        className="w-5 h-5 rounded border-gray-300 text-indigo-600 focus:ring-indigo-600"
                                    />
                                    <input
                                        type="text"
                                        value={step.text}
                                        onChange={(e) => {
                                            const newSteps = [...editSteps];
                                            newSteps[index].text = e.target.value;
                                            setEditSteps(newSteps);
                                        }}
                                        placeholder={t('taskEdit.stepPlaceholder')}
                                        className={`flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${step.completed ? 'line-through text-muted-foreground' : ''}`}
                                    />
                                    <Button
                                        type="button"
                                        variant="ghost"
                                        size="icon"
                                        onClick={() => {
                                            const newSteps = editSteps.filter(s => s.id !== step.id);
                                            setEditSteps(newSteps);
                                        }}
                                        className="text-muted-foreground hover:text-red-500 hover:bg-red-50"
                                        title={t('taskEdit.deleteStep')}
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" y1="11" x2="10" y2="17" /><line x1="14" y1="11" x2="14" y2="17" /></svg>
                                    </Button>
                                </div>
                            ))}
                            {editSteps.length === 0 && (
                                <div className="text-center py-6 text-sm text-muted-foreground border-2 border-dashed rounded-lg">
                                    No steps added yet. Add steps to create a timeline in your PDF.
                                </div>
                            )}
                        </div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t">
                        <Button type="button" variant="outline" onClick={onBack}>{t('taskEdit.cancel')}</Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">{t('taskEdit.submitSave')}</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
