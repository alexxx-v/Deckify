import { db, useLiveQuery } from '@/db/schema';
import { Button } from '@/components/ui/button';
import { useTranslation } from 'react-i18next';
import { TaskTypeManager } from './TaskTypeManager';

export function ProjectSettings({ projectId, onBack }: { projectId: string; onBack: () => void }) {
    const { t } = useTranslation();
    const project = useLiveQuery(() => db.projects.get(projectId));

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
                <TaskTypeManager 
                    projectId={projectId} 
                    description={t('settings.taskTypesDesc', 'Define custom categories for your tasks. These will be used for grouping in lists and roadmaps.')}
                    showGlobalNotice={true}
                />
            </div>
        </div>
    );
}
