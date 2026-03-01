import { useLiveQuery } from 'dexie-react-hooks';
import { db } from '@/db/schema';

export function Dashboard() {
    // Get all records for overall stats
    const projects = useLiveQuery(() => db.projects.toArray());
    const tasks = useLiveQuery(() => db.tasks.toArray());

    const totalCompanies = projects?.length || 0;
    const totalTasks = tasks?.length || 0;
    const completedTasks = tasks?.filter(t => t.progress === 100).length || 0;

    let overallProgress = 0;
    if (totalTasks > 0 && tasks) {
        overallProgress = Math.round(tasks.reduce((sum, t) => sum + t.progress, 0) / totalTasks);
    }

    return (
        <div className="space-y-6">
            <h2 className="text-2xl font-bold mb-6">Overview Dashboard</h2>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-indigo-600 mb-2">{totalCompanies}</span>
                    <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Projects</span>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-indigo-600 mb-2">{totalTasks}</span>
                    <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Total Tasks</span>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-emerald-600 mb-2">{completedTasks}</span>
                    <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Completed Tasks</span>
                </div>

                <div className="bg-card border rounded-xl p-6 shadow-sm flex flex-col items-center justify-center">
                    <span className="text-4xl font-bold text-indigo-600 mb-2">{overallProgress}%</span>
                    <span className="text-sm text-muted-foreground font-medium uppercase tracking-wider">Average Progress</span>
                </div>
            </div>

            <div className="bg-card border rounded-xl p-6 shadow-sm mt-8">
                <h3 className="text-lg font-semibold mb-4">Recent Projects</h3>
                {projects?.length === 0 ? (
                    <p className="text-muted-foreground">No projects added yet.</p>
                ) : (
                    <div className="space-y-3">
                        {projects?.slice(-5).reverse().map(p => {
                            const projectTasks = tasks?.filter(t => t.projectId === p.id) || [];
                            const pTaskCount = projectTasks.length;
                            const pCompletedCount = projectTasks.filter(t => t.progress === 100).length;
                            const pProgress = pTaskCount > 0
                                ? Math.round(projectTasks.reduce((sum, t) => sum + t.progress, 0) / pTaskCount)
                                : 0;

                            return (
                                <div key={p.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 border-b last:border-0 gap-2">
                                    <div className="flex flex-col">
                                        <span className="font-medium text-foreground">{p.name}</span>
                                        <span className="text-xs text-muted-foreground">{new Date(p.createdAt).toLocaleDateString()}</span>
                                    </div>
                                    <div className="flex items-center gap-6 text-sm text-muted-foreground">
                                        <div className="flex flex-col sm:items-end">
                                            <span>Tasks: {pCompletedCount} / {pTaskCount}</span>
                                            {pTaskCount > 0 && <span>Progress: {pProgress}%</span>}
                                        </div>
                                    </div>
                                </div>
                            );
                        })}
                    </div>
                )}
            </div>
        </div>
    );
}
