import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Project, Task } from '@/db/schema';
import { pdf } from '@react-pdf/renderer';
import { ProjectPresentation } from './ProjectPresentation';

interface ExportModalProps {
    project: Project;
    tasks: Task[];
    onClose: () => void;
}

export function ExportModal({ project, tasks, onClose }: ExportModalProps) {
    const currentYear = new Date().getFullYear();
    const currentMonth = new Date().toLocaleString('en-US', { month: 'long' });
    const currentQuarter = `Q${Math.floor((new Date().getMonth() + 3) / 3)}`;

    const [periodType, setPeriodType] = useState<'month' | 'quarter' | 'year'>('month');
    const [selectedMonth, setSelectedMonth] = useState(currentMonth);
    const [selectedQuarter, setSelectedQuarter] = useState(currentQuarter);
    const [selectedYear, setSelectedYear] = useState(currentYear.toString());

    const [periodText, setPeriodText] = useState(`${project.name} ${currentMonth} ${currentYear}`);
    const [isGenerating, setIsGenerating] = useState(false);

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
            const doc = <ProjectPresentation project={project} tasks={tasks} period={periodText} />;
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
        } catch (error) {
            console.error('Failed to generate PDF', error);
            alert('Failed to generate PDF');
        } finally {
            setIsGenerating(false);
        }
    };

    return (
        <div className="fixed inset-0 bg-background/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
            <div className="bg-card w-full max-w-md rounded-xl shadow-lg border p-6">
                <div className="flex justify-between items-center mb-6">
                    <h2 className="text-xl font-bold">Export Presentation</h2>
                    <button onClick={onClose} className="text-muted-foreground hover:text-foreground">
                        <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                    </button>
                </div>

                <div className="space-y-4">
                    <div>
                        <label className="block text-sm font-medium mb-1.5">Period Format</label>
                        <div className="flex bg-muted p-1 rounded-lg w-fit mb-4">
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'month' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('month')}
                            >
                                Month
                            </button>
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'quarter' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('quarter')}
                            >
                                Quarter
                            </button>
                            <button
                                className={`px-4 py-1.5 text-sm font-medium rounded-md transition-colors ${periodType === 'year' ? 'bg-background shadow-sm text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                                onClick={() => setPeriodType('year')}
                            >
                                Year
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

                        <label className="block text-sm font-medium mb-1">Generated Title</label>
                        <input
                            type="text"
                            value={periodText}
                            onChange={(e) => setPeriodText(e.target.value)}
                            placeholder="Report Title"
                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                        />
                        <p className="text-xs text-muted-foreground mt-1">This will appear on the title slide and be used as the file name.</p>
                    </div>

                    <div className="bg-muted p-4 rounded-lg flex gap-3 text-sm mt-4">
                        <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-primary shrink-0"><circle cx="12" cy="12" r="10" /><path d="M12 16v-4" /><path d="M12 8h.01" /></svg>
                        <div>The PDF will contain 4 sections: Title, Overview, Task Details, and Roadmap.</div>
                    </div>

                    <div className="pt-4 flex justify-end gap-3">
                        <Button variant="outline" onClick={onClose} disabled={isGenerating}>Cancel</Button>
                        <Button onClick={handleExport} disabled={isGenerating}>
                            {isGenerating ? 'Generating...' : 'Download PDF'}
                        </Button>
                    </div>
                </div>
            </div>
        </div>
    );
}
