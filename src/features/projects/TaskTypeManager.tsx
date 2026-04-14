import { useState } from 'react';
import { db, useLiveQuery, TaskType } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

interface TaskTypeManagerProps {
    projectId?: string; // If undefined, manages global types
    title?: string;
    description?: string;
    showGlobalNotice?: boolean;
}

export function TaskTypeManager({ projectId, title, description, showGlobalNotice }: TaskTypeManagerProps) {
    const { t } = useTranslation();
    
    const taskTypes = useLiveQuery(() => {
        if (projectId) {
            return db.taskTypes.where('projectId').equals(projectId).toArray();
        } else {
            return db.taskTypes.getGlobal();
        }
    }, [projectId]);

    const [newTypeName, setNewTypeName] = useState('');
    const [newTypeColor, setNewTypeColor] = useState('#4F46E5');

    const handleAddType = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newTypeName.trim()) return;

        await db.taskTypes.add({
            id: uuidv4(),
            projectId, // will be undefined for global types
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

    const handleToggleGlobal = async (tt: TaskType) => {
        if (tt.projectId) {
            // Make global
            if (confirm(t('settings.makeGlobalConfirm', 'Make this type global? It will be available in all projects.'))) {
                await db.taskTypes.update(tt.id, { projectId: undefined });
            }
        } else {
            // This case might be less common but could be useful if we want to restrict a global type
            // But we'd need to know WHICH project to restrict it to.
            // For now, let's only allow making local -> global.
        }
    };

    return (
        <div className="space-y-6">
            <div>
                <h3 className="text-lg font-semibold mb-2">{title || t('settings.taskTypes', 'Task Types')}</h3>
                {description && (
                    <p className="text-sm text-muted-foreground mb-6">{description}</p>
                )}

                <form onSubmit={handleAddType} className="flex flex-wrap gap-4 items-end bg-muted/30 p-4 rounded-lg mb-6 shadow-inner">
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">{t('settings.typeName', 'Type Name')}</label>
                        <input
                            required
                            type="text"
                            value={newTypeName}
                            onChange={(e) => setNewTypeName(e.target.value)}
                            placeholder={t('settings.typeNamePlaceholder', 'e.g. Design, Development')}
                            className="flex h-10 w-full sm:w-64 rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 shadow-sm"
                        />
                    </div>
                    <div className="space-y-2">
                        <label className="text-xs font-bold uppercase text-muted-foreground">{t('settings.color', 'Color')}</label>
                        <input
                            type="color"
                            value={newTypeColor}
                            onChange={(e) => setNewTypeColor(e.target.value)}
                            className="block h-10 w-16 p-1 rounded-md border border-input bg-background cursor-pointer shadow-sm"
                        />
                    </div>
                    <Button type="submit" className="shadow-sm">{t('settings.addType', 'Add Type')}</Button>
                </form>

                <div className="space-y-3">
                    {taskTypes?.map((tt: TaskType) => (
                        <div key={tt.id} className="flex items-center gap-4 p-3 border rounded-lg hover:bg-muted/10 transition-all shadow-sm bg-card/50">
                            <input
                                type="color"
                                value={tt.color}
                                onChange={(e) => handleUpdateType(tt.id, { color: e.target.value })}
                                className="h-8 w-8 rounded cursor-pointer border-0 p-0 overflow-hidden shrink-0 shadow-sm"
                            />
                            <div className="flex-1 flex items-center gap-2">
                                <input
                                    type="text"
                                    value={tt.name}
                                    onChange={(e) => handleUpdateType(tt.id, { name: e.target.value })}
                                    className="flex-1 bg-transparent border-0 focus:ring-0 font-medium text-sm outline-none"
                                />
                                {!tt.projectId && showGlobalNotice && (
                                    <span className="text-[10px] bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded font-bold uppercase tracking-wider">
                                        {t('settings.globalLabel', 'Global')}
                                    </span>
                                )}
                            </div>
                            
                            <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                                {/* Only show "Make Global" for local types in project settings */}
                                {projectId && tt.projectId && (
                                    <Button 
                                        variant="ghost" 
                                        size="icon" 
                                        onClick={() => handleToggleGlobal(tt)} 
                                        title={t('settings.makeGlobal', 'Make Global')}
                                        className="h-8 w-8 text-muted-foreground hover:text-indigo-600"
                                    >
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a14.5 14.5 0 0 0 0 20 14.5 14.5 0 0 0 0-20"/><path d="M2 12h20"/></svg>
                                    </Button>
                                )}
                                
                                <Button 
                                    variant="ghost" 
                                    size="icon" 
                                    onClick={() => handleDeleteType(tt.id)} 
                                    className="h-8 w-8 text-muted-foreground hover:text-destructive"
                                >
                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                </Button>
                            </div>
                        </div>
                    ))}
                    
                    {taskTypes?.length === 0 && (
                        <div className="text-center py-8 border-2 border-dashed rounded-lg bg-muted/5">
                            <p className="text-sm text-muted-foreground">
                                {projectId 
                                    ? t('settings.noProjectTaskTypes', 'No local types for this project.') 
                                    : t('settings.noGlobalTaskTypes', 'No global task types defined yet.')
                                }
                            </p>
                        </div>
                    )}
                </div>
            </div>
        </div>
    );
}
