import { useState } from 'react';
import { db } from '@/db/schema';
import { useLiveQuery } from 'dexie-react-hooks';
import { v4 as uuidv4 } from 'uuid';
import { Button } from '@/components/ui/button';

export function ProjectList({ onSelect }: { onSelect: (id: string) => void }) {
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

    const deleteProject = async (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        if (confirm('Are you sure you want to delete this company and all its tasks?')) {
            await db.projects.delete(id);
            // CASCADE DELETE TASKS:
            const tasksToDelete = await db.tasks.where('projectId').equals(id).toArray();
            const taskIds = tasksToDelete.map(t => t.id);
            await db.tasks.bulkDelete(taskIds);
        }
    }

    return (
        <div className="space-y-6">
            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <h2 className="text-xl font-semibold mb-4">Create New Company</h2>
                <form onSubmit={addProject} className="flex gap-3">
                    <input
                        type="text"
                        value={newProjectName}
                        onChange={(e) => setNewProjectName(e.target.value)}
                        placeholder="Company Name..."
                        className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
                    />
                    <Button type="submit">Add Company</Button>
                </form>
            </div>

            <div className="space-y-4">
                <h2 className="text-xl font-semibold">Your Companies</h2>
                {projects?.length === 0 && (
                    <p className="text-muted-foreground">No companies yet. Add one above!</p>
                )}
                <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                    {projects?.map(project => (
                        <div
                            key={project.id}
                            onClick={() => onSelect(project.id)}
                            className="group cursor-pointer bg-card border rounded-xl p-5 shadow-sm hover:shadow-md transition-all hover:border-primary/50 relative"
                        >
                            <h3 className="font-medium text-lg mb-1 pr-8">{project.name}</h3>
                            <p className="text-xs text-muted-foreground">
                                Created {new Date(project.createdAt).toLocaleDateString()}
                            </p>

                            <button
                                onClick={(e) => deleteProject(e, project.id)}
                                className="absolute top-4 right-4 text-muted-foreground hover:text-destructive opacity-0 group-hover:opacity-100 transition-opacity"
                                title="Delete Company"
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
