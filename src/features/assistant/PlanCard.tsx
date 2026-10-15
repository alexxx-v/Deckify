import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import type { ScreenInfo } from '@/features/ai/agent/context';
import type { PlanMessage } from '@/features/ai/agent/conversationState';
import { confirmPlan, rejectPlan, replan, undoLast } from '@/features/ai/agent/session';
import type { DiffItem } from '@/features/ai/actions/types';
import { fieldLabel, formatValue } from './format';

const COLLAPSED_ITEMS = 8;

const OP_STYLE: Record<DiffItem['op'], { sign: string; cls: string }> = {
    create: { sign: '+', cls: 'bg-emerald-100 text-emerald-700' },
    update: { sign: '✎', cls: 'bg-indigo-100 text-indigo-700' },
    delete: { sign: '−', cls: 'bg-red-100 text-red-700' },
};

export function PlanCard({ message, canUndo, screen }: { message: PlanMessage; canUndo: boolean; screen: ScreenInfo }) {
    const { t } = useTranslation();
    const [expanded, setExpanded] = useState(false);
    const [confirmTask, setConfirmTask] = useState<string | null>(null);
    const { plan, status, outcome } = message;

    const visible = expanded ? plan.diff : plan.diff.slice(0, COLLAPSED_ITEMS);
    const hidden = plan.diff.length - COLLAPSED_ITEMS;

    const execute = () => {
        const result = confirmPlan(message.id);
        if (result.needsConfirm) setConfirmTask(result.taskId);
    };
    const confirmTitle = confirmTask
        ? plan.diff.find(d => d.id === confirmTask)?.label ?? t('assistant.plan.openTask')
        : '';

    return (
        <div className={`rounded-2xl border bg-card text-card-foreground shadow-sm text-sm ${status === 'superseded' || status === 'rejected' ? 'opacity-60' : ''}`}>
            <div className="px-3 pt-3 pb-1 flex items-center justify-between gap-2">
                <span className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
                    {t('assistant.plan.title')}
                </span>
                {status !== 'pending' && (
                    <span className={`text-xs font-medium ${status === 'executed' ? 'text-emerald-600' : status === 'stale' || status === 'failed' ? 'text-amber-600' : 'text-muted-foreground'}`}>
                        {t(`assistant.plan.${status}`)}
                    </span>
                )}
            </div>

            {message.reply && <p className="px-3 pb-2 whitespace-pre-wrap">{message.reply}</p>}

            <ul className="px-3 pb-2 space-y-2">
                {visible.map(item => (
                    <li key={`${item.entity}:${item.id}:${item.op}`} className="flex gap-2">
                        <span className={`mt-0.5 shrink-0 h-5 w-5 rounded-md text-xs font-bold flex items-center justify-center ${OP_STYLE[item.op].cls}`} title={t(`assistant.ops.${item.op}`)}>
                            {OP_STYLE[item.op].sign}
                        </span>
                        <div className="min-w-0 flex-1">
                            <div className="font-medium break-words">
                                {t(`assistant.ops.${item.op}`)} {t(`assistant.entity.${item.entity}`)} «{item.label}»
                                {item.projectName && <span className="font-normal text-muted-foreground"> · {item.projectName}</span>}
                            </div>
                            {item.changes.length > 0 && (
                                <ul className="mt-0.5 text-xs text-muted-foreground space-y-0.5">
                                    {item.changes.map(c => (
                                        <li key={c.field}>
                                            <span>{fieldLabel(t, c.field)}: </span>
                                            {item.op === 'update' && <><span className="line-through">{formatValue(t, c.field, c.from)}</span> → </>}
                                            <span className="text-foreground">{formatValue(t, c.field, c.to)}</span>
                                        </li>
                                    ))}
                                </ul>
                            )}
                            {item.cascade && (item.cascade.tasks > 0 || item.cascade.boardLinks > 0 || item.cascade.taskTypes > 0) && (
                                <div className="mt-0.5 text-xs text-red-600">
                                    {t('assistant.plan.cascade', { tasks: item.cascade.tasks, links: item.cascade.boardLinks, types: item.cascade.taskTypes })}
                                </div>
                            )}
                        </div>
                    </li>
                ))}
            </ul>
            {hidden > 0 && (
                <button type="button" className="px-3 pb-2 text-xs text-indigo-600 hover:underline" onClick={() => setExpanded(e => !e)}>
                    {expanded ? t('assistant.plan.showLess') : t('assistant.plan.showAll', { count: plan.diff.length })}
                </button>
            )}

            {plan.warnings.length > 0 && (
                <ul className="mx-3 mb-2 p-2 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 text-xs space-y-0.5">
                    {plan.warnings.map(w => <li key={`${w.code}:${w.actionIndex}`}>{w.message}</li>)}
                </ul>
            )}

            {status === 'pending' && confirmTask === null && (
                <div className="px-3 pb-3 flex gap-2">
                    <Button size="sm" onClick={execute}>{t('assistant.plan.execute')}</Button>
                    <Button size="sm" variant="outline" onClick={() => rejectPlan(message.id)}>{t('assistant.plan.reject')}</Button>
                </div>
            )}

            {status === 'pending' && confirmTask !== null && (
                <div className="mx-3 mb-3 p-2 rounded-md bg-yellow-50 text-yellow-800 border border-yellow-200 text-xs space-y-2">
                    <p>{t('assistant.plan.confirmDirty', { title: confirmTitle })}</p>
                    <div className="flex gap-2">
                        <Button size="sm" onClick={() => { setConfirmTask(null); confirmPlan(message.id, { force: true }); }}>{t('assistant.plan.confirmExecute')}</Button>
                        <Button size="sm" variant="outline" onClick={() => setConfirmTask(null)}>{t('assistant.plan.cancel')}</Button>
                    </div>
                </div>
            )}

            {status === 'executed' && outcome?.counts && (
                <div className="px-3 pb-3 space-y-2">
                    <p className="text-xs text-muted-foreground">
                        {t('assistant.plan.result', { created: outcome.counts.created, updated: outcome.counts.updated, deleted: outcome.counts.deleted })}
                    </p>
                    {outcome.undo === 'failed' && <p className="text-xs text-amber-600">{t('assistant.plan.undoUnavailable')}</p>}
                    {outcome.undo === 'saved' && canUndo && (
                        <Button size="sm" variant="outline" onClick={undoLast}>{t('assistant.plan.undo')}</Button>
                    )}
                </div>
            )}

            {status === 'stale' && (
                <div className="px-3 pb-3">
                    <Button size="sm" variant="outline" onClick={() => { void replan(screen); }}>{t('assistant.plan.replan')}</Button>
                </div>
            )}
            {status === 'failed' && outcome?.message && <p className="px-3 pb-3 text-xs text-red-600 break-words">{outcome.message}</p>}
        </div>
    );
}
