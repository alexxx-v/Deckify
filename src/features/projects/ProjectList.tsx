import { useState } from 'react';
import { db, useLiveQuery } from '@/db/schema';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';

export function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
    const { t } = useTranslation();
    const [newProjectName, setNewProjectName] = useState('');

    const projects = useLiveQuery(() => db.projects.orderBy('createdAt').reverse().toArray());

    const addProject = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!newProjectName.trim()) return;

        await db.projects.add({
            id: uuidv4(),
            name: newProjectName.trim(),
            createdAt: Date.now()
        });
        setNewProjectName('');
    };

    const deleteProject = async (e: React.MouseEvent, id: string, name: string) => {
        e.stopPropagation();
        if (confirm(t('tasks.deleteProjectConfirm', { name }))) {
            const tasksToDelete = await db.tasks.where('projectId').equals(id).toArray() as any[];
            const taskIds = tasksToDelete.map((t: any) => t.id);
            if (taskIds.length > 0) await db.tasks.bulkDelete(taskIds);
            await db.projects.delete(id);
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4">{t('projects.addTitle')}</h2>
                <form onSubmit={addProject} className="flex gap-3">
                    <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder={t('projects.projectName')}
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button type="submit">{t('projects.submit')}</Button>
                </form>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold">{t('projects.title')}</h2>
                {projects?.length === 0 && (
                    <div className="flex flex-col items-center justify-center p-12 mt-4 text-center border-2 border-dashed border-muted-foreground/20 rounded-2xl bg-muted/10 animate-in fade-in zoom-in duration-500">
                        <div className="w-16 h-16 bg-muted/50 rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 10h12" /><path d="M4 14h9" /><path d="M19 6a2 2 0 0 0-2-2H7a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V6Z" /></svg>
                        </div>
                        <h3 className="text-lg font-semibold tracking-tight text-foreground mb-1">{t('projects.noProjects')}</h3>
                        <p className="text-sm text-muted-foreground max-w-sm text-balance">
                            Cоздайте свой первый проект используя форму выше, чтобы начать планировать задачи и строить Roadmap.
                        </p>
                    </div>
                )}
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                    {projects?.map((project: any) => (
                        <div
                            key={project.id}
                            onClick={() => onSelect(project.id)}
                            className="relative bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-shadow cursor-pointer flex flex-col justify-between group"
                        >
                            <h3 className="font-medium text-lg mb-1 pr-8">{project.name}</h3>
                            <p className="text-xs text-muted-foreground">
                                Created {new Date(project.createdAt).toLocaleDateString()}
                            </p>

                            <button
                                onClick={(e) => deleteProject(e, project.id, project.name)}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity p-1 rounded hover:bg-destructive/10"
                                title={t('tasks.deleteProject')}
                            >
                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                            </button>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}
