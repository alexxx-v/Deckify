import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { db, ExportTemplate, TemplateBlock, TemplateBlockType } from '@/db/schema';
import { useTranslation } from 'react-i18next';
import { v4 as uuidv4 } from 'uuid';

const AVAILABLE_BLOCKS: { type: TemplateBlockType, defaultProps: any }[] = [
    { type: 'TITLE_PAGE', defaultProps: { showSubtitle: true } },
    { type: 'STATS', defaultProps: { showCompleted: true, showProgress: true } },
    { type: 'TASKS_LIST', defaultProps: {} },
    { type: 'TASK_DETAIL', defaultProps: { includeDescription: true, includeSteps: true } },
    { type: 'ROADMAP', defaultProps: {} },
];

export function TemplatesView() {
    const { t } = useTranslation();
    const [templates, setTemplates] = useState<ExportTemplate[]>([]);
    const [activeTemplateId, setActiveTemplateId] = useState<string | null>(null);
    const [templateName, setTemplateName] = useState('');
    const [blocks, setBlocks] = useState<TemplateBlock[]>([]);
    const [selectedBlockId, setSelectedBlockId] = useState<string | null>(null);

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
                { id: uuidv4(), type: 'STATS', props: { showCompleted: true, showProgress: true } },
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
        db.templates.update(activeTemplateId, {
            name: templateName,
            blocks: JSON.stringify(blocks),
            updatedAt: Date.now()
        });
        loadTemplates(); // reload to get updated list
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
                                        </div>
                                        <span className="text-sm font-medium">{t(`templates.block_${block.type}` as any)}</span>
                                        <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="ml-auto text-muted-foreground opacity-50"><path d="M5 12h14" /><path d="M12 5v14" /></svg>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Center Canvas: Layout Editor */}
                    <div className="flex-1 flex flex-col bg-[#F9FAFB] min-w-0">
                        <div className="p-4 border-b bg-background flex items-center justify-between gap-4 shrink-0">
                            <input
                                type="text"
                                value={templateName}
                                onChange={(e) => setTemplateName(e.target.value)}
                                className="flex h-10 w-full max-w-sm rounded-md border-transparent bg-muted/50 px-3 py-2 text-sm font-semibold focus-visible:outline-none focus-visible:border-input focus-visible:ring-2 focus-visible:ring-indigo-500"
                                placeholder={t('templates.templateName')}
                            />
                            <div className="flex gap-2">
                                <Button variant="ghost" className="text-destructive hover:bg-destructive/10 hover:text-destructive" onClick={handleDeleteTemplate}>{t('sidebar.dashboard') /* fallback debug */} Delete</Button>
                                <Button onClick={handleSaveTemplate}>{t('templates.save')}</Button>
                            </div>
                        </div>

                        <div className="flex-1 overflow-y-auto p-8">
                            <div className="max-w-xl mx-auto space-y-3">
                                {blocks.length === 0 && (
                                    <div className="text-center p-8 border-2 border-dashed rounded-xl border-muted-foreground/20 text-muted-foreground">
                                        {t('templates.blocks')}
                                    </div>
                                )}
                                {blocks.map((block, index) => (
                                    <div
                                        key={block.id}
                                        onClick={() => setSelectedBlockId(block.id)}
                                        className={`bg-card border rounded-xl p-4 flex items-center gap-4 transition-all cursor-pointer ${selectedBlockId === block.id ? 'border-indigo-500 ring-1 ring-indigo-500 shadow-md' : 'hover:border-indigo-300 shadow-sm'}`}
                                    >
                                        <div className="flex flex-col gap-1 shrink-0">
                                            <button
                                                onClick={(e) => handleMoveBlock(e, index, 'up')}
                                                disabled={index === 0}
                                                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m18 15-6-6-6 6" /></svg>
                                            </button>
                                            <button
                                                onClick={(e) => handleMoveBlock(e, index, 'down')}
                                                disabled={index === blocks.length - 1}
                                                className="p-1 rounded-md text-muted-foreground hover:bg-muted hover:text-foreground disabled:opacity-30 disabled:hover:bg-transparent"
                                            >
                                                <svg xmlns="http://www.w3.org/2000/svg" width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="m6 9 6 6 6-6" /></svg>
                                            </button>
                                        </div>

                                        <div className="flex-1">
                                            <div className="font-semibold text-sm">{t(`templates.block_${block.type}` as any)}</div>
                                            <div className="text-xs text-muted-foreground mt-1">
                                                {Object.keys(block.props).length > 0 ? (
                                                    <span>Configured</span>
                                                ) : (
                                                    <span>Default</span>
                                                )}
                                            </div>
                                        </div>

                                        <button
                                            onClick={(e) => handleDeleteBlock(e, block.id)}
                                            className="p-2 rounded-md text-muted-foreground hover:bg-destructive/10 hover:text-destructive shrink-0"
                                        >
                                            <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 6h18" /><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" /><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" /><line x1="10" x2="10" y1="11" y2="17" /><line x1="14" x2="14" y1="11" y2="17" /></svg>
                                        </button>
                                    </div>
                                ))}
                            </div>
                        </div>
                    </div>

                    {/* Right Panel: Block Properties */}
                    <div className="w-80 border-l bg-background flex flex-col shrink-0">
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
                                                <>
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
                                                </>
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
                                                <div className="text-sm text-muted-foreground">No configurable properties for this block yet.</div>
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
    );
}

