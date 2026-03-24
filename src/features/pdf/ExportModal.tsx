import { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Button } from '@/components/ui/button';
import { Project, Task, db, ExportTemplate, TaskType } from '@/db/schema';
import { pdf } from '@react-pdf/renderer';
import { ProjectPresentation } from './ProjectPresentation';
import { DynamicPdfRenderer } from './DynamicPdfRenderer';
import { useTranslation } from 'react-i18next';
import dayjs from 'dayjs';

interface ExportModalProps {
    project: Project;
    tasks: Task[];
    onClose: () => void;
}

export function ExportModal({ project, tasks, onClose }: ExportModalProps) {
    const { t } = useTranslation();
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    const currentQuarter = `Q${Math.floor((new Date().getMonth() + 3) / 3)}`;

    const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year'>('month');
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
    const [selectedYear, setSelectedYear] = useState(currentYear.toString());

    const [periodText, setPeriodText] = useState(`${project.name} ${currentMonth} ${currentYear}`);
    const [isGenerating, setIsGenerating] = useState(false);

    const [templates, setTemplates] = useState<ExportTemplate[]>([]);
    const [selectedTemplateId, setSelectedTemplateId] = useState<string>('');
    const [taskTypes, setTaskTypes] = useState<TaskType[]>([]);

    useEffect(() => {
        const loaded = db.templates.toArray() as ExportTemplate[];
        setTemplates(loaded);
        if (loaded.length > 0) {
            setSelectedTemplateId(loaded[0].id);
        }

        const loadedTypes = db.taskTypes.where('projectId').equals(project.id).toArray() as TaskType[];
        setTaskTypes(loadedTypes);
    }, [project.id]);

    useEffect(() => {
        let p = '';
        if (periodType === 'month') p = `${selectedMonth} ${selectedYear}`;
        else if (periodType === 'quarter') p = `${selectedQuarter} ${selectedYear}`;
        else if (periodType === 'year') p = `${selectedYear}`;

        setPeriodText(`${project.name} ${p}`);
    }, [periodType, selectedMonth, selectedQuarter, selectedYear, project.name]);

    const months = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const quarters = ['Q1', 'Q2', 'Q3', 'Q4'];
    const years = Array.from({ length: 5 }, (_, i) => (currentYear - 2 + i).toString());

    const handleExport = async () => {
        setIsGenerating(true);
        try {
            let rangeStart = dayjs();
            let rangeEnd = dayjs();

            if (periodType === 'month') {
                const monthIndex = months.indexOf(selectedMonth);
                rangeStart = dayjs(new Date(parseInt(selectedYear, 10), monthIndex, 1)).startOf('month');
                rangeEnd = rangeStart.clone().endOf('month');
            } else if (periodType === 'quarter') {
                const qIndex = parseInt(selectedQuarter.replace('Q', ''), 10) - 1;
                rangeStart = dayjs(new Date(parseInt(selectedYear, 10), qIndex * 3, 1)).startOf('month');
                rangeEnd = rangeStart.clone().add(2, 'month').endOf('month');
            } else if (periodType === 'year') {
                rangeStart = dayjs(new Date(parseInt(selectedYear, 10), 0, 1)).startOf('year');
                rangeEnd = rangeStart.clone().endOf('year');
            }

            const filteredTasks = tasks.filter(t => {
                const tStart = dayjs(t.startDate);
                const tEnd = dayjs(t.startDate).add(t.duration, 'day');
                return tStart.isBefore(rangeEnd) && tEnd.isAfter(rangeStart);
            });

            const template = templates.find(t => t.id === selectedTemplateId);
            const doc = template
                ? <DynamicPdfRenderer project={project} tasks={filteredTasks} allProjectTasks={tasks} taskTypes={taskTypes} period={periodText} startDate={rangeStart.format('YYYY-MM-DD')} endDate={rangeEnd.format('YYYY-MM-DD')} blocksJson={template.blocks} />
                : <ProjectPresentation project={project} tasks={filteredTasks} taskTypes={taskTypes} period={periodText} startDate={rangeStart.format('YYYY-MM-DD')} endDate={rangeEnd.format('YYYY-MM-DD')} />;

            const asPdf = pdf();
            asPdf.updateContainer(doc);
            const blob = await asPdf.toBlob();

            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            const fileName = periodText.trim().replace(/\s+/g, '_') + '.pdf';
            a.download = fileName;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            URL.revokeObjectURL(url);

            onClose();
        } catch (error: any) {
            console.error('Failed to generate PDF', error);
            // Show more details if possible
            const errorMsg = error instanceof Error ? error.message : String(error);
            alert(`Failed to generate PDF: ${errorMsg}`);
        } finally {
            setIsGenerating(false);
        }
    };

    return createPortal(
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-[100] flex items-center justify-center p-4 animate-in fade-in duration-200">
            <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6 animate-in zoom-in-95 duration-200 max-h-[90vh] overflow-y-auto flex flex-col">
                <div className="flex justify-between items-center mb-6 shrink-0">
                    <h2 className="text-xl font-bold">{t('export.title')}</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="space-y-4 shrink-0">
                    <div>
                        <label className="block text-sm font-medium mb-1.5">{t('export.periodFormat')}</label>
                        <div className="flex bg-muted p-1 rounded-lg w-fit mb-4">
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('month')}
                            >
                                {t('export.month')}
                            </button>
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'quarter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('quarter')}
                            >
                                {t('export.quarter')}
                            </button>
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('year')}
                            >
                                {t('export.year')}
                            </button>
                        </div>

                        <div className="flex gap-3 mb-4">
                            {periodType === 'month' && (
                                <select
                                    value={selectedMonth}
                                    onChange={(e) => setSelectedMonth(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {months.map(m => <option key={m} value={m}>{m}</option>)}
                                </select>
                            )}
                            {periodType === 'quarter' && (
                                <select
                                    value={selectedQuarter}
                                    onChange={(e) => setSelectedQuarter(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {quarters.map(q => <option key={q} value={q}>{q}</option>)}
                                </select>
                            )}
                            <select
                                value={selectedYear}
                                onChange={(e) => setSelectedYear(e.target.value)}
                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                            >
                                {years.map(y => <option key={y} value={y}>{y}</option>)}
                            </select>
                        </div>

                        <label className="block text-sm font-medium mb-1">{t('export.generatedTitle')}</label>
                        <input
                            type="text"
                            value={periodText}
                            onChange={(e) => setPeriodText(e.target.value)}
                            placeholder={t('export.titlePlaceholder')}
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground mt-1 mb-4">{t('export.titleHint')}</p>

                        {templates.length > 0 && (
                            <>
                                <label className="block text-sm font-medium mb-1">{t('templates.select') || 'Select Template'}</label>
                                <select
                                    value={selectedTemplateId}
                                    onChange={(e) => setSelectedTemplateId(e.target.value)}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                                >
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </>
                        )}
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isGenerating}>{t('export.cancel')}</Button>
                        <Button onClick={handleExport} disabled={isGenerating}>
                            {isGenerating ? t('export.generating') : t('export.download')}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
        , document.body);
}
