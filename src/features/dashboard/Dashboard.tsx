import { db, useLiveQuery } from '@/db/schema';

export function Dashboard() {
    // Get all records for overall stats
    const projects = useLiveQuery(() => db.projects.toArray());
    const tasks = useLiveQuery(() => db.tasks.toArray());

    const totalCompanies = projects?.length || 0;
    const totalTasks = tasks?.length || 0;
    const completedTasksStr = tasks ? tasks.filter((t: any) => t.progress === 100).length : 0;
    const allProgressSum = tasks ? tasks.reduce((sum: number, t: any) => sum + t.progress, 0) : 0;

    let overallProgress = 0;
    if (totalTasks > 0 && tasks) {
        overallProgress = Math.round(allProgressSum / totalTasks);
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
                    <span className="text-4xl font-bold text-emerald-600 mb-2">{completedTasksStr}</span>
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
                        {projects?.slice(-5).reverse().map((p: any) => {
                            const pTasks = tasks ? tasks.filter((t: any) => t.projectId === p.id) : [];
                            const pCompleted = pTasks.filter((t: any) => t.progress === 100).length;
                            const pTotal = pTasks.length;
                            const avgProgress = pTotal === 0 ? 0 : Math.round(pTasks.reduce((sum: number, t: any) => sum + t.progress, 0) / pTotal);

                            return (
                                <div key={p.id} className="flex flex-col sm:flex-row sm:justify-between sm:items-center py-3 border-b last:border-0 gap-2">
                                    <div className="flex justify-between w-full sm:w-auto overflow-hidden">
                                        <h4 className="font-medium truncate">{p.name}</h4>
                                        <span className="sm:hidden text-xs text-muted-foreground">{pCompleted}/{pTotal}</span>
                                    </div>
                                    <div className="flex items-center gap-4 text-sm w-full sm:w-auto">
                                        <div className="hidden sm:block text-muted-foreground tabular-nums">{pCompleted}/{pTotal} tasks</div>
                                        <div className="flex-1 sm:w-32 h-2.5 bg-secondary rounded-full overflow-hidden">
                                            <div className="bg-emerald-500 h-full rounded-full transition-all" style={{ width: `${avgProgress}%` }}></div>
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
