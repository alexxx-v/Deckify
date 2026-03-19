import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db, ExportTemplate, TemplateBlock, TemplateBlockType } from '@/db/schema';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';
import MDEditor from '@uiw/react-md-editor';

const AVAILABLE_BLOCKS: { type: TemplateBlockType, defaultProps: any }[] = [
    { type: 'TITLE_PAGE', defaultProps: { showSubtitle: true } },
    { type: 'STATS', defaultProps: { showCompleted: true, showProgress: true, showTotalTasks: true, showInProgress: true, showHoldTasks: true } },
    { type: 'TASKS_LIST', defaultProps: {} },
    { type: 'TASK_DETAIL', defaultProps: { includeDescription: true, includeSteps: true } },
    { type: 'ROADMAP', defaultProps: { dateRange: 'export' } },
    { type: 'TEXT', defaultProps: { title: 'Custom Section', content: 'Enter your text here...' } },
];

export function TemplatesView() {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<ExportTemplate[]>([]);
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [templateName, setTemplateName] = useState('');
    const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);
    const [saveStatus, setSaveStatus] = useState<'idle' | 'saving' | 'saved'>('idle');

    useEffect(() => {
        loadTemplates();
    }, []);

    const loadTemplates = () => {
        const loaded = db.templates.toArray() as ExportTemplate[];
        setTemplates(loaded);
        if (loaded.length === 0 && activeTemplateId) {
            resetEditor();
        } else if (loaded.length > 0 && !activeTemplateId) {
            selectTemplate(loaded[0]);
        } else if (loaded.length > 0 && activeTemplateId) {
            const current = loaded.find(t => t.id === activeTemplateId);
            if (current) selectTemplate(current);
            else selectTemplate(loaded[0]);
        }
    };

    const resetEditor = () => {
        setActiveTemplateId(null);
        setTemplateName('');
        setBlocks([]);
        setSelectedBlockId(null);
    };

    const selectTemplate = (template: ExportTemplate) => {
        setActiveTemplateId(template.id);
        setTemplateName(template.name);
        try {
            setBlocks(JSON.parse(template.blocks));
        } catch (e) {
            setBlocks([]);
        }
        setSelectedBlockId(null);
    };

    const handleCreateTemplate = () => {
        const newTemplate: ExportTemplate = {
            id: uuidv4(),
            name: `${t('templates.title')} - ${new Date().toLocaleDateString()}`,
            blocks: JSON.stringify([
                { id: uuidv4(), type: 'TITLE_PAGE', props: { showSubtitle: true } },
                { id: uuidv4(), type: 'STATS', props: { showCompleted: true, showProgress: true, showTotalTasks: true, showInProgress: true, showHoldTasks: true } },
                { id: uuidv4(), type: 'TASKS_LIST', props: {} }
            ]),
            createdAt: Date.now(),
            updatedAt: Date.now(),
        };
        db.templates.add(newTemplate);
        loadTemplates();
        selectTemplate(newTemplate);
    };

    const handleSaveTemplate = () => {
        if (!activeTemplateId) return;
        setSaveStatus('saving');
        db.templates.update(activeTemplateId, {
            name: templateName,
            blocks: JSON.stringify(blocks),
            updatedAt: Date.now()
        });
        loadTemplates();
        setTimeout(() => {
            setSaveStatus('saved');
            setTimeout(() => setSaveStatus('idle'), 2500);
        }, 300);
    };

    const handleDeleteTemplate = () => {
        if (!activeTemplateId) return;
        if (confirm(t('templates.deleteConfirm'))) {
            db.templates.delete(activeTemplateId);
            resetEditor();
            loadTemplates();
        }
    };

    const handleAddBlock = (type: TemplateBlockType) => {
        const blockDef = AVAILABLE_BLOCKS.find(b => b.type === type);
        if (!blockDef) return;

        const newBlock: TemplateBlock = {
            id: uuidv4(),
            type,
            props: { ...blockDef.defaultProps }
        };

        setBlocks([...blocks, newBlock]);
        setSelectedBlockId(newBlock.id);
    };

    const handleDeleteBlock = (e: React.MouseEvent, id: string) => {
        e.stopPropagation();
        setBlocks(blocks.filter(b => b.id !== id));
        if (selectedBlockId === id) setSelectedBlockId(null);
    };

    const handleMoveBlock = (e: React.MouseEvent, index: number, direction: 'up' | 'down') => {
        e.stopPropagation();
        if (direction === 'up' && index > 0) {
            const newBlocks = [...blocks];
            [newBlocks[index - 1], newBlocks[index]] = [newBlocks[index], newBlocks[index - 1]];
            setBlocks(newBlocks);
        } else if (direction === 'down' && index < blocks.length - 1) {
            const newBlocks = [...blocks];
            [newBlocks[index], newBlocks[index + 1]] = [newBlocks[index + 1], newBlocks[index]];
            setBlocks(newBlocks);
        }
    };

    const updateBlockProp = (id: string, propKey: string, value: any) => {
        setBlocks(blocks.map(b => {
            if (b.id !== id) return b;
            return {
                ...b,
                props: {
                    ...b.props,
                    [propKey]: value
                }
            };
        }));
    };

    const selectedBlock = blocks.find(b => b.id === selectedBlockId);

    return (
        <>
            <div className="space-y-6 flex flex-col h-[calc(100vh-6rem)]">
                <div className="flex justify-between items-center shrink-0">
                    <h2 className="text-2xl font-bold">{t('templates.title')}</h2>
                    <Button onClick={handleCreateTemplate} className="flex gap-2">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                        {t('templates.createTemplate')}
                    </Button>
                </div>

                {templates.length === 0 ? (
                    <div className="bg-card w-full rounded-2xl border border-dashed p-12 text-center flex flex-col items-center justify-center flex-1">
                        <div className="w-16 h-16 bg-muted rounded-full flex items-center justify-center mb-4 text-muted-foreground">
                            <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" /><polyline points="14 2 14 8 20 8" /><line x1="16" y1="13" x2="8" y2="13" /><line x1="16" y1="17" x2="8" y2="17" /><polyline points="10 9 9 9 8 9" /></svg>
                        </div>
                        <h3 className="text-xl font-bold mb-2">{t('templates.noTemplates')}</h3>
                        <Button onClick={handleCreateTemplate} className="mt-4">{t('templates.createTemplate')}</Button>
                    </div>
                ) : (
                    <div className="flex bg-card border rounded-xl shadow-sm flex-1 overflow-hidden min-h-0">
                        {/* Left Panel: Template Selection & Available Blocks */}
                        <div className="w-64 border-r bg-muted/30 flex flex-col shrink-0">
                            <div className="p-4 border-b">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-2 block">{t('templates.select')}</label>
                                <select
                                    value={activeTemplateId || ''}
                                    onChange={(e) => {
                                        const selected = templates.find(t => t.id === e.target.value);
                                        if (selected) selectTemplate(selected);
                                    }}
                                    className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                >
                                    {templates.map(t => (
                                        <option key={t.id} value={t.id}>{t.name}</option>
                                    ))}
                                </select>
                            </div>

                            <div className="p-4 flex-1 overflow-y-auto">
                                <label className="text-xs font-semibold text-muted-foreground uppercase tracking-wider mb-3 block">{t('templates.blocks')}</label>
                                <div className="space-y-2">
                                    {AVAILABLE_BLOCKS.map(block => (
                                        <div
                                            key={block.type}
                                            onClick={() => handleAddBlock(block.type)}
                                            className="bg-background border rounded-lg p-3 cursor-pointer hover:border-indigo-400 hover:shadow-sm transition-all flex items-center gap-3"
                                        >
                                            <div className="text-indigo-500 shrink-0">
                                                {block.type === 'TITLE_PAGE' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 22h14a2 2 0 0 0 2-2V7.5L14.5 2H6a2 2 0 0 0-2 2v4" /><polyline points="14 2 14 8 20 8" /><path d="M2 15h10" /><path d="m9 18 3-3-3-3" /></svg>}
                                                {block.type === 'STATS' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" x2="18" y1="20" y2="10" /><line x1="12" x2="12" y1="20" y2="4" /><line x1="6" x2="6" y1="20" y2="14" /></svg>}
                                                {block.type === 'TASKS_LIST' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="8" x2="21" y1="6" y2="6" /><line x1="8" x2="21" y1="12" y2="12" /><line x1="8" x2="21" y1="18" y2="18" /><line x1="3" x2="3.01" y1="6" y2="6" /><line x1="3" x2="3.01" y1="12" y2="12" /><line x1="3" x2="3.01" y1="18" y2="18" /></svg>}
                                                {block.type === 'TASK_DETAIL' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect width="18" height="18" x="3" y="3" rx="2" /><path d="M7 7h10" /><path d="M7 12h10" /><path d="M7 17h10" /></svg>}
                                                {block.type === 'ROADMAP' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 3v18h18" /><path d="M7 10h6" /><path d="M11 14h8" /><path d="M5 6h4" /></svg>}
                                                {block.type === 'TEXT' && <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="4" x2="20" y1="7" y2="7" /><line x1="4" x2="20" y1="12" y2="12" /><line x1="4" x2="14" y1="17" y2="17" /></svg>}
                                            </div>
                                            <span className="text-sm font-medium">{t(`templates.block_${block.type}` as any)}</span>
                                            <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted-foreground opacity-50"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Center Canvas: Layout Editor */}
                        <div className="w-[550px] shrink-0 flex flex-col bg-[#F9FAFB]">
                            <div className="p-4 border-b bg-background flex items-center justify-between gap-4 shrink-0">
                                <input
                                    type="text"
                                    value={templateName}
                                    onChange={(e) => setTemplateName(e.target.value)}
                                    className="flex h-10 w-full max-w-sm rounded-md border-transparent bg-muted/50 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-indigo-500"
                                    placeholder={t('templates.templateName')}
                                />
                                <div className="flex gap-2 items-center">
                                    <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDeleteTemplate}>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="mr-1.5"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                        {t('templates.deleteTemplate')}
                                    </Button>
                                    <Button onClick={handleSaveTemplate} disabled={saveStatus === 'saving'} className="min-w-[160px] transition-all">
                                        {saveStatus === 'saving' ? (
                                            <span className="flex items-center gap-2">
                                                <svg className="animate-spin" xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 12a9 9 0 1 1-6.219-8.56" /></svg>
                                                {t('templates.saving')}
                                            </span>
                                        ) : saveStatus === 'saved' ? (
                                            <span className="flex items-center gap-2">
                                                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                                                {t('templates.saved')}
                                            </span>
                                        ) : (
                                            t('templates.save')
                                        )}
                                    </Button>
                                </div>
                            </div>

                            <div className="flex-1 overflow-y-auto p-8">
                                <div className="max-w-md mx-auto space-y-3">
                                    {blocks.length === 0 && (
                                        <div className="text-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/20 text-muted-foreground">
                                            {t('templates.blocks')}
                                        </div>
                                    )}
                                    {blocks.map((block, index) => (
                                        <div
                                            key={block.id}
                                            onClick={() => setSelectedBlockId(block.id)}
                                            className={`bg-card border rounded-xl overflow-hidden transition-all cursor-pointer ${selectedBlockId === block.id ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-md' : 'hover:border-indigo-300 shadow-sm'}`}
                                        >
                                            {/* Block Header */}
                                            <div className="flex items-center gap-3 px-4 py-2.5 border-b bg-muted/20">
                                                <div className="flex flex-col gap-0.5 shrink-0">
                                                    <button
                                                        onClick={(e) => handleMoveBlock(e, index, 'up')}
                                                        disabled={index === 0}
                                                        className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                                    </button>
                                                    <button
                                                        onClick={(e) => handleMoveBlock(e, index, 'down')}
                                                        disabled={index === blocks.length - 1}
                                                        className="p-0.5 rounded text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                                    >
                                                        <svg xmlns="http://www.w3.org/2000/svg" width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                                    </button>
                                                </div>
                                                <div className="flex-1 text-xs font-semibold text-foreground/70 uppercase tracking-wider">{t(`templates.block_${block.type}` as any)}</div>
                                                <button
                                                    onClick={(e) => handleDeleteBlock(e, block.id)}
                                                    className="p-1.5 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                                                >
                                                    <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /></svg>
                                                </button>
                                            </div>

                                            {/* Block Preview */}
                                            <div className="p-4">
                                                {/* TITLE_PAGE preview */}
                                                {block.type === 'TITLE_PAGE' && (
                                                    <div className="bg-muted/30 rounded-lg p-5 flex flex-col items-center justify-center" style={{ aspectRatio: '16/7' }}>
                                                        <div className="w-2/3 h-3 bg-foreground/60 rounded-full mb-2" />
                                                        {block.props.showSubtitle !== false && (
                                                            <div className="w-1/3 h-2 bg-muted-foreground/30 rounded-full" />
                                                        )}
                                                    </div>
                                                )}

                                                {/* STATS preview */}
                                                {block.type === 'STATS' && (
                                                    <div className="bg-muted/30 rounded-lg p-4" style={{ aspectRatio: '16/7' }}>
                                                        <div className="w-1/3 h-1.5 bg-foreground/40 rounded-full mb-3" />
                                                        <div className="flex gap-4 justify-around flex-wrap mt-4">
                                                            {block.props.showTotalTasks !== false && (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="text-lg font-bold text-indigo-500">11</div>
                                                                    <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
                                                                </div>
                                                            )}
                                                            {block.props.showProgress !== false && (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="text-lg font-bold text-indigo-500">73%</div>
                                                                    <div className="w-12 h-1 bg-muted-foreground/20 rounded-full" />
                                                                </div>
                                                            )}
                                                            {block.props.showCompleted !== false && (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="text-lg font-bold text-indigo-500">8</div>
                                                                    <div className="w-10 h-1 bg-muted-foreground/20 rounded-full" />
                                                                </div>
                                                            )}
                                                            {block.props.showInProgress !== false && (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="text-lg font-bold text-indigo-500">3</div>
                                                                    <div className="w-14 h-1 bg-muted-foreground/20 rounded-full" />
                                                                </div>
                                                            )}
                                                            {block.props.showHoldTasks !== false && (
                                                                <div className="flex flex-col items-center gap-1.5">
                                                                    <div className="text-lg font-bold text-indigo-500">0</div>
                                                                    <div className="w-8 h-1 bg-muted-foreground/20 rounded-full" />
                                                                </div>
                                                            )}
                                                        </div>
                                                    </div>
                                                )}

                                                {/* TASKS_LIST preview */}
                                                {block.type === 'TASKS_LIST' && (
                                                    <div className="bg-muted/30 rounded-lg p-4" style={{ aspectRatio: '16/7' }}>
                                                        <div className="w-1/3 h-1.5 bg-foreground/40 rounded-full mb-3" />
                                                        <div className="space-y-2">
                                                            <div className="flex items-center justify-between">
                                                                <div className="w-2/3 h-1.5 bg-muted-foreground/20 rounded-full" />
                                                                <div className="w-12 h-4 bg-green-100 border border-green-200 rounded text-[7px] text-green-700 font-bold flex items-center justify-center">DONE</div>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <div className="w-1/2 h-1.5 bg-muted-foreground/20 rounded-full" />
                                                                <div className="w-12 h-4 bg-blue-100 border border-blue-200 rounded text-[7px] text-blue-700 font-bold flex items-center justify-center">WIP</div>
                                                            </div>
                                                            <div className="flex items-center justify-between">
                                                                <div className="w-3/5 h-1.5 bg-muted-foreground/20 rounded-full" />
                                                                <div className="w-12 h-4 bg-gray-100 border border-gray-200 rounded text-[7px] text-gray-600 font-bold flex items-center justify-center">NEW</div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* TASK_DETAIL preview */}
                                                {block.type === 'TASK_DETAIL' && (
                                                    <div className="bg-muted/30 rounded-lg p-4" style={{ aspectRatio: '16/7' }}>
                                                        <div className="w-2/5 h-2 bg-foreground/50 rounded-full mb-3" />
                                                        <div className="flex gap-6 mb-3">
                                                            <div className="flex flex-col gap-1"><div className="w-6 h-1 bg-muted-foreground/15 rounded-full" /><div className="w-10 h-1.5 bg-muted-foreground/25 rounded-full" /></div>
                                                            <div className="flex flex-col gap-1"><div className="w-5 h-1 bg-muted-foreground/15 rounded-full" /><div className="w-8 h-1.5 bg-muted-foreground/25 rounded-full" /></div>
                                                            <div className="flex flex-col gap-1"><div className="w-7 h-1 bg-muted-foreground/15 rounded-full" /><div className="w-12 h-4 bg-blue-100 border border-blue-200 rounded" /></div>
                                                        </div>
                                                        <div className="flex gap-3 items-center mb-2">
                                                            <div className="flex-1 h-1.5 bg-muted-foreground/10 rounded-full overflow-hidden"><div className="h-full w-3/5 bg-indigo-400/50 rounded-full" /></div>
                                                            <span className="text-[8px] text-muted-foreground font-medium">60%</span>
                                                        </div>
                                                        {block.props.includeDescription !== false && (
                                                            <div className="flex gap-2 mt-1">
                                                                <div className="flex-1 space-y-1">
                                                                    <div className="w-full h-1 bg-muted-foreground/10 rounded-full" />
                                                                    <div className="w-4/5 h-1 bg-muted-foreground/10 rounded-full" />
                                                                </div>
                                                                {block.props.includeSteps !== false && (
                                                                    <div className="w-1/3 flex flex-col gap-1 pl-2 border-l border-muted-foreground/10">
                                                                        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full bg-foreground/40" /><div className="w-full h-1 bg-muted-foreground/10 rounded-full" /></div>
                                                                        <div className="flex items-center gap-1"><div className="w-1.5 h-1.5 rounded-full border border-muted-foreground/30" /><div className="w-4/5 h-1 bg-muted-foreground/10 rounded-full" /></div>
                                                                    </div>
                                                                )}
                                                            </div>
                                                        )}
                                                    </div>
                                                )}

                                                {/* ROADMAP preview */}
                                                {block.type === 'ROADMAP' && (
                                                    <div className="bg-muted/30 rounded-lg p-4" style={{ aspectRatio: '16/7' }}>
                                                        <div className="flex items-center gap-2 mb-3">
                                                            <div className="w-1/4 h-1.5 bg-foreground/40 rounded-full" />
                                                            <span className="text-[9px] font-semibold text-muted-foreground/60 uppercase tracking-wider ml-auto">
                                                                {t(`templates.dateRange_${block.props.dateRange || 'export'}` as any)}
                                                            </span>
                                                        </div>
                                                        <div className="space-y-2">
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1 bg-muted-foreground/15 rounded-full shrink-0" />
                                                                <div className="flex-1 h-3 bg-muted-foreground/10 rounded relative">
                                                                    <div className="absolute top-0.5 h-2 rounded bg-green-400/50" style={{ left: '5%', width: '40%' }} />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1 bg-muted-foreground/15 rounded-full shrink-0" />
                                                                <div className="flex-1 h-3 bg-muted-foreground/10 rounded relative">
                                                                    <div className="absolute top-0.5 h-2 rounded bg-blue-400/50" style={{ left: '20%', width: '50%' }} />
                                                                </div>
                                                            </div>
                                                            <div className="flex items-center gap-2">
                                                                <div className="w-16 h-1 bg-muted-foreground/15 rounded-full shrink-0" />
                                                                <div className="flex-1 h-3 bg-muted-foreground/10 rounded relative">
                                                                    <div className="absolute top-0.5 h-2 rounded bg-yellow-400/50" style={{ left: '50%', width: '35%' }} />
                                                                </div>
                                                            </div>
                                                        </div>
                                                    </div>
                                                )}

                                                {/* TEXT preview */}
                                                {block.type === 'TEXT' && (
                                                    <div className="bg-muted/30 rounded-lg p-4" style={{ aspectRatio: '16/7' }}>
                                                        {block.props.title && (
                                                            <div className="w-2/5 h-2 bg-foreground/40 rounded-full mb-3 border-b border-muted-foreground/10 pb-2" />
                                                        )}
                                                        <div className="space-y-1.5 mt-1">
                                                            <div className="w-full h-1 bg-muted-foreground/15 rounded-full" />
                                                            <div className="w-11/12 h-1 bg-muted-foreground/15 rounded-full" />
                                                            <div className="w-4/5 h-1 bg-muted-foreground/15 rounded-full" />
                                                            <div className="w-9/12 h-1 bg-muted-foreground/15 rounded-full" />
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        </div>

                        {/* Right Panel: Block Properties */}
                        <div className="flex-1 border-l bg-background flex flex-col min-w-0">
                            <div className="p-4 border-b bg-muted/20">
                                <h3 className="font-semibold text-sm">{t('templates.properties')}</h3>
                            </div>
                            <div className="p-4 flex-1 overflow-y-auto">
                                {!selectedBlock ? (
                                    <div className="text-sm text-center text-muted-foreground mt-10">
                                        Select a block to edit its properties
                                    </div>
                                ) : (
                                    <div className="space-y-6">
                                        <div>
                                            <h4 className="text-sm font-bold text-foreground mb-4 pb-2 border-b">
                                                {t(`templates.block_${selectedBlock.type}` as any)} Settings
                                            </h4>

                                            <div className="space-y-4">
                                                {selectedBlock.type === 'TITLE_PAGE' && (
                                                    <label className="flex items-center gap-3 cursor-pointer">
                                                        <input
                                                            type="checkbox"
                                                            checked={selectedBlock.props.showSubtitle ?? true}
                                                            onChange={(e) => updateBlockProp(selectedBlock.id, 'showSubtitle', e.target.checked)}
                                                            className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                        />
                                                        <span className="text-sm">{t('templates.prop_showSubtitle')}</span>
                                                    </label>
                                                )}

                                                {selectedBlock.type === 'STATS' && (
                                                    <div className="space-y-3">
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.showCompleted ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'showCompleted', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_showCompleted')}</span>
                                                        </label>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.showProgress ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'showProgress', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_showProgress')}</span>
                                                        </label>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.showTotalTasks ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'showTotalTasks', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_showTotalTasks')}</span>
                                                        </label>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.showInProgress ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'showInProgress', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_showInProgress')}</span>
                                                        </label>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.showHoldTasks ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'showHoldTasks', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_showHoldTasks')}</span>
                                                        </label>
                                                    </div>
                                                )}

                                                {selectedBlock.type === 'TASKS_LIST' && (
                                                    <div className="text-sm text-muted-foreground">No configurable properties for this block yet.</div>
                                                )}

                                                {selectedBlock.type === 'TASK_DETAIL' && (
                                                    <>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.includeDescription ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'includeDescription', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_includeDescription')}</span>
                                                        </label>
                                                        <label className="flex items-center gap-3 cursor-pointer">
                                                            <input
                                                                type="checkbox"
                                                                checked={selectedBlock.props.includeSteps ?? true}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'includeSteps', e.target.checked)}
                                                                className="w-4 h-4 rounded text-indigo-600 focus:ring-indigo-500"
                                                            />
                                                            <span className="text-sm">{t('templates.prop_includeSteps')}</span>
                                                        </label>
                                                    </>
                                                )}

                                                {selectedBlock.type === 'ROADMAP' && (
                                                    <div className="space-y-2">
                                                        <label className="text-sm font-medium">{t('templates.prop_dateRange')}</label>
                                                        <select
                                                            value={selectedBlock.props.dateRange || 'export'}
                                                            onChange={(e) => updateBlockProp(selectedBlock.id, 'dateRange', e.target.value)}
                                                            className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                        >
                                                            <option value="export">{t('templates.dateRange_export')}</option>
                                                            <option value="month">{t('templates.dateRange_month')}</option>
                                                            <option value="quarter">{t('templates.dateRange_quarter')}</option>
                                                            <option value="year">{t('templates.dateRange_year')}</option>
                                                        </select>
                                                        <p className="text-xs text-muted-foreground">{t('templates.dateRange_hint')}</p>
                                                    </div>
                                                )}

                                                {selectedBlock.type === 'TEXT' && (
                                                    <>
                                                        <div className="space-y-2">
                                                            <label className="text-sm font-medium">{t('templates.prop_textTitle')}</label>
                                                            <input
                                                                type="text"
                                                                value={selectedBlock.props.title || ''}
                                                                onChange={(e) => updateBlockProp(selectedBlock.id, 'title', e.target.value)}
                                                                className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500"
                                                            />
                                                        </div>
                                                        <div className="space-y-2 mt-4" data-color-mode="light">
                                                            <label className="text-sm font-medium">{t('templates.prop_textContent')}</label>
                                                            <MDEditor
                                                                value={selectedBlock.props.content || ''}
                                                                onChange={(val) => updateBlockProp(selectedBlock.id, 'content', val || '')}
                                                                height={300}
                                                                enableScroll={false}
                                                            />
                                                        </div>
                                                    </>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>
                    </div>
                )}
            </div>

            {/* Save toast notification */}
            <div className={`fixed bottom-6 right-6 z-50 transition-all duration-500 ease-out ${saveStatus === 'saved'
                ? 'translate-y-0 opacity-100'
                : 'translate-y-4 opacity-0 pointer-events-none'
                }`}>
                <div className="flex items-center gap-3 bg-foreground text-background px-5 py-3.5 rounded-xl shadow-2xl">
                    <div className="w-7 h-7 bg-emerald-500 rounded-full flex items-center justify-center shrink-0">
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5" /></svg>
                    </div>
                    <span className="text-sm font-medium">{t('templates.savedNotification')}</span>
                </div>
            </div>
        </>
    );
}

