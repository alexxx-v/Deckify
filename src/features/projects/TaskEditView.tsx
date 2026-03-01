import { useState, useEffect } from 'react';
import { db } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { useLiveQuery } from 'dexie-react-hooks';

export function TaskEditView({ taskId, onBack }: { taskId: string, onBack: () => void }) {
    // Initial fetch of the task using live query to keep it reactive if updated elsewhere
    const task = useLiveQuery(() => db.tasks.get(taskId));

    const [editTitle, setEditTitle] = useState('');
    const [editDescription, setEditDescription] = useState('');
    const [editStartDate, setEditStartDate] = useState('');
    const [editDuration, setEditDuration] = useState('');
    const [editProgress, setEditProgress] = useState('0');

    // Populate local state once the task loads
    useEffect(() => {
        if (task) {
            setEditTitle(task.title);
            setEditDescription(task.description || '');
            setEditStartDate(task.startDate);
            setEditDuration(task.duration.toString());
            setEditProgress(task.progress.toString());
        }
    }, [task]);

    const handleSave = async (e: React.FormEvent) => {
        e.preventDefault();
        if (!editTitle.trim()) return;

        await db.tasks.update(taskId, {
            title: editTitle.trim(),
            description: editDescription.trim(),
            startDate: editStartDate,
            duration: parseInt(editDuration, 10) || 1,
            progress: parseInt(editProgress, 10) || 0
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
                <h2 className="text-2xl font-bold">Edit Task</h2>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm">
                <form onSubmit={handleSave} className="space-y-5">
                    <div>
                        <label className="text-sm font-medium mb-1.5 block">Title</label>
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
                            <label className="text-sm font-medium mb-1.5 block">Start Date</label>
                            <input
                                required
                                type="date"
                                value={editStartDate}
                                onChange={(e) => setEditStartDate(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                        <div>
                            <label className="text-sm font-medium mb-1.5 block">Duration (days)</label>
                            <input
                                required
                                type="number"
                                min="1"
                                value={editDuration}
                                onChange={(e) => setEditDuration(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            />
                        </div>
                    </div>

                    <div>
                        <label className="text-sm font-medium mb-1.5 block">
                            Progress Status ({editProgress}%)
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
                        <label className="text-sm font-medium mb-1.5 block">Description</label>
                        <textarea
                            value={editDescription}
                            onChange={(e) => setEditDescription(e.target.value)}
                            rows={6}
                            className="flex w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring resize-y"
                        />
                    </div>

                    <div className="pt-4 flex justify-end gap-3 border-t">
                        <Button type="button" variant="outline" onClick={onBack}>Cancel</Button>
                        <Button type="submit" className="bg-indigo-600 hover:bg-indigo-700 text-white">Save Changes</Button>
                    </div>
                </form>
            </div>
        </div>
    );
}
