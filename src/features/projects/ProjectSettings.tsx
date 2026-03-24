import { useState } from 'react';
import { db, useLiveQuery, TaskType } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function ProjectSettings({ projectId, onBack }: { projectId: string; onBack: () => void }) {
    const { t } = useTranslation();
    const project = useLiveQuery(() => db.projects.get(projectId));
    const taskTypes = useLiveQuery(() => db.taskTypes.where('projectId').equals(projectId).toArray());

    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeColor, setNewTypeColor] = useState('#4F46E5');

    const handleAddType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTypeName.trim()) return;

        await db.taskTypes.add({
            id: uuidv4(),
            projectId,
            name: newTypeName.trim(),
            color: newTypeColor
        });

        setNewTypeName('');
        setNewTypeColor('#4F46E5');
    };

    const handleDeleteType = async (id: string) => {
        if (confirm(t('settings.deleteTypeConfirm', 'Are you sure you want to delete this task type? Tasks using this type will have it unassigned.'))) {
            await db.taskTypes.delete(id);
        }
    };

    const handleUpdateType = async (id: string, updates: Partial<TaskType>) => {
        await db.taskTypes.update(id, updates);
    };

    if (!project) return <div>Loading...</div>;

    return (
        <div className="space-y-6">
            <div className="flex items-center gap-3">
                <Button variant="outline" size="icon" onClick={onBack}>
                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m15 18-6-6 6-6" /></svg>
                </Button>
                <h2 className="text-2xl font-bold">{t('settings.projectSettings', 'Project Settings')} - {project.name}</h2>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm space-y-6">
                <div>
                    <h3 className="text-lg font-semibold mb-4">{t('settings.taskTypes', 'Task Types')}</h3>
                    <p className="text-sm text-muted-foreground mb-6">
                        {t('settings.taskTypesDesc', 'Define custom categories for your tasks. These will be used for grouping in lists and roadmaps.')}
                    </p>

                    <form onSubmit={handleAddType} className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-lg mb-6">
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">{t('settings.typeName', 'Type Name')}</label>
                            <input
                                required
                                type="text"
                                value={newTypeName}
                                onChange={(e) => setNewTypeName(e.target.value)}
                                placeholder={t('settings.typeNamePlaceholder', 'e.g. Design, Development')}
                                className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                            />
                        </div>
                        <div className="space-y-2">
                            <label className="text-xs font-bold uppercase text-muted-foreground">{t('settings.color', 'Color')}</label>
                            <input
                                type="color"
                                value={newTypeColor}
                                onChange={(e) => setNewTypeColor(e.target.value)}
                                className="block h-10 w-16 p-1 rounded-md border border-input bg-background cursor-pointer"
                            />
                        </div>
                        <Button type="submit">{t('settings.addType', 'Add Type')}</Button>
                    </form>

                    <div className="space-y-3">
                        {taskTypes?.map((tt: TaskType) => (
                            <div key={tt.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/10 transition-colors">
                                <input
                                    type="color"
                                    value={tt.color}
                                    onChange={(e) => handleUpdateType(tt.id, { color: e.target.value })}
                                    className="h-8 w-8 rounded cursor-pointer border-0 p-0 overflow-hidden shrink-0"
                                />
                                <input
                                    type="text"
                                    value={tt.name}
                                    onChange={(e) => handleUpdateType(tt.id, { name: e.target.value })}
                                    className="flex-1 bg-transparent border-0 focus:ring-0 font-medium text-sm"
                                />
                                <Button variant="ghost" size="icon" onClick={() => handleDeleteType(tt.id)} className="text-muted-foreground hover:text-destructive">
                                    <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                </Button>
                            </div>
                        ))}
                        {taskTypes?.length === 0 && (
                            <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/10">
                                <p className="text-sm text-muted-foreground">{t('settings.noTaskTypes', 'No task types defined yet.')}</p>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
