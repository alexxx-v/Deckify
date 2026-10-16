import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Button } from '@/components/ui/button';
import { loadAiConfig } from '@/features/ai/aiConfig';
import type { ScreenInfo } from '@/features/ai/agent/context';
import { useConversation } from '@/features/ai/agent/conversation';
import { latestExecutedPlan } from '@/features/ai/agent/conversationState';
import type { UiMessage } from '@/features/ai/agent/conversationState';
import { getReadiness, getUndoInfo, MAX_MESSAGE_CHARS, newDialog, sendMessage, setDataChangedHandler, stopTurn, undoLast } from '@/features/ai/agent/session';
import type { DataChange, Readiness } from '@/features/ai/agent/session';
import { aiErrorKey } from '@/features/ai/errorText';
import { isSmallModel, parseParamSizeB } from '@/features/ai/ollamaUtils';
import { isAiAvailable } from '@/features/ai/transport';
import { Markdown } from './Markdown';
import { PlanCard } from './PlanCard';

interface Props {
    screen: ScreenInfo;
    onOpenSettings: () => void;
    onDataChanged: (change: DataChange) => void;
}

const iconProps = { width: 18, height: 18, viewBox: '0 0 24 24', fill: 'none', stroke: 'currentColor', strokeWidth: 2, strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

function MessageView({ message, canUndo, screen }: { message: UiMessage; canUndo: boolean; screen: ScreenInfo }) {
    const { t } = useTranslation();
    switch (message.kind) {
        case 'user':
            return <div className="ml-8 self-end rounded-2xl rounded-br-sm bg-indigo-600 text-white px-3 py-2 text-sm whitespace-pre-wrap break-words">{message.text}</div>;
        case 'assistant':
            return <Markdown className="mr-8 self-start rounded-2xl rounded-bl-sm bg-muted px-3 py-2 text-sm break-words" text={message.text} />;
        case 'plan':
            return <PlanCard message={message} canUndo={canUndo} screen={screen} />;
        case 'error':
            return (
                <div className="rounded-2xl border border-red-200 bg-red-50 text-red-700 px-3 py-2 text-xs space-y-1" role="alert">
                    {message.code === 'invalid' && <p>{t('assistant.errors.invalid')}</p>}
                    {message.code === 'provider' && message.ai && (
                        <>
                            <p>{t(aiErrorKey(message.ai.kind, message.ai.mode))}</p>
                            {message.ai.detail && <p className="text-[10px] italic break-words">{message.ai.detail}</p>}
                        </>
                    )}
                    {message.code === 'undo_conflict' && <p>{t('assistant.errors.undoConflict')}</p>}
                    {message.code === 'undo_error' && <p>{t('assistant.errors.undoError')}</p>}
                    {message.problems && message.problems.length > 0 && (
                        <ul className="list-disc pl-4 space-y-0.5 break-words">
                            {message.problems.slice(0, 6).map((p, i) => <li key={i}>{p}</li>)}
                        </ul>
                    )}
                </div>
            );
        case 'info':
            return (
                <div className="self-center text-xs text-muted-foreground text-center px-4">
                    {message.code === 'undone' ? t('assistant.info.undone', { labels: (message.labels ?? []).join(', ') }) : t('assistant.info.aborted')}
                </div>
            );
    }
}

export function AiAssistant({ screen, onOpenSettings, onDataChanged }: Props) {
    const { t } = useTranslation();
    const [available] = useState(isAiAvailable);
    const conv = useConversation();
    const [open, setOpen] = useState(false);
    const [input, setInput] = useState('');
    const [readiness, setReadiness] = useState<Readiness | null>(null);
    const [now, setNow] = useState(() => Date.now());
    const listRef = useRef<HTMLDivElement>(null);
    const inputRef = useRef<HTMLTextAreaElement>(null);

    // Only the newest executed plan can be undone (the undo record holds one plan).
    const undoTargetId = latestExecutedPlan(conv)?.id ?? null;
    const undoInfo = useMemo(() => getUndoInfo(), [conv.messages, open]); // eslint-disable-line react-hooks/exhaustive-deps
    const hasPending = conv.messages.some(m => m.kind === 'plan' && m.status === 'pending');

    useEffect(() => setDataChangedHandler(onDataChanged), [onDataChanged]);

    useEffect(() => {
        if (!open) return;
        let cancelled = false;
        getReadiness().then(r => { if (!cancelled) setReadiness(r); });
        return () => { cancelled = true; };
    }, [open, screen.tab]);

    useEffect(() => {
        if (!conv.busy) return;
        const timer = setInterval(() => setNow(Date.now()), 500);
        return () => clearInterval(timer);
    }, [conv.busy]);

    useEffect(() => {
        const list = listRef.current;
        if (list) list.scrollTop = list.scrollHeight;
    }, [conv.messages.length, conv.busy, open]);

    useEffect(() => {
        if (open && readiness === 'ok') inputRef.current?.focus();
    }, [open, readiness]);

    if (!available) return null;

    const config = loadAiConfig();
    const small = !!config.model && isSmallModel(parseParamSizeB('', config.model));
    const ready = readiness === 'ok';
    const submit = (text = input) => {
        const value = text.trim();
        if (!value || conv.busy || !ready) return;
        setInput('');
        void sendMessage(value, screen);
        inputRef.current?.focus();
    };
    const examples = [t('assistant.empty.ex1'), t('assistant.empty.ex2'), t('assistant.empty.ex3')];

    return (
        <>
            {open && (
                <div
                    role="dialog"
                    aria-label={t('assistant.title')}
                    className="fixed bottom-24 right-6 z-50 w-[440px] max-w-[calc(100vw-3rem)] h-[600px] max-h-[calc(100vh-8rem)] flex flex-col rounded-2xl border bg-card text-card-foreground shadow-2xl animate-in fade-in slide-in-from-bottom-4 duration-200"
                    onKeyDown={(e) => { if (e.key === 'Escape') setOpen(false); }}
                >
                    <div className="px-4 py-3 border-b flex items-center gap-2">
                        <div className="min-w-0 flex-1">
                            <div className="font-semibold leading-tight">{t('assistant.title')}</div>
                            <div className="text-[11px] text-muted-foreground truncate" title={small ? t('assistant.smallModel') : undefined}>
                                {config.model || '—'}{small ? ' ⚠' : ''}
                            </div>
                        </div>
                        <Button variant="ghost" size="icon-sm" onClick={undoLast} disabled={!undoInfo.available || conv.busy} title={t('assistant.undoLast')} aria-label={t('assistant.undoLast')}>
                            <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}><path d="M3 7v6h6" /><path d="M21 17a9 9 0 0 0-9-9 9 9 0 0 0-6 2.3L3 13" /></svg>
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={newDialog} disabled={conv.messages.length === 0 && !conv.busy} title={t('assistant.newDialog')} aria-label={t('assistant.newDialog')}>
                            <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}><path d="M12 20h9" /><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" /></svg>
                        </Button>
                        <Button variant="ghost" size="icon-sm" onClick={() => setOpen(false)} title={t('assistant.close')} aria-label={t('assistant.close')}>
                            <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}><path d="M18 6 6 18" /><path d="m6 6 12 12" /></svg>
                        </Button>
                    </div>

                    {config.mode === 'cloud' && <div className="px-4 py-1.5 text-[11px] bg-yellow-50 text-yellow-800 border-b border-yellow-200">{t('assistant.cloudNotice')}</div>}

                    {readiness !== null && readiness !== 'ok' ? (
                        <div className="flex-1 flex flex-col items-center justify-center gap-4 px-8 text-center">
                            <p className="text-sm text-muted-foreground">
                                {readiness === 'no_key' ? t('assistant.notReady.noKey') : t('assistant.notReady.noModel')}
                            </p>
                            <Button onClick={() => { setOpen(false); onOpenSettings(); }}>{t('assistant.notReady.goToSettings')}</Button>
                        </div>
                    ) : (
                        <div ref={listRef} className="flex-1 overflow-y-auto px-4 py-3 flex flex-col gap-3" aria-live="polite">
                            {conv.messages.length === 0 && !conv.busy && (
                                <div className="my-auto space-y-3">
                                    <p className="text-center font-medium">{t('assistant.empty.title')}</p>
                                    {examples.map(example => (
                                        <button
                                            key={example}
                                            type="button"
                                            className="w-full text-left text-xs rounded-lg border px-3 py-2 text-muted-foreground hover:bg-muted hover:text-foreground transition-colors"
                                            onClick={() => { setInput(example); inputRef.current?.focus(); }}
                                        >
                                            {example}
                                        </button>
                                    ))}
                                </div>
                            )}
                            {conv.messages.map(m => <MessageView key={m.id} message={m} canUndo={undoInfo.available && !conv.busy && m.id === undoTargetId} screen={screen} />)}
                            {conv.busy && (
                                <div className="flex items-center gap-2 text-xs text-muted-foreground">
                                    <span className="inline-block h-3 w-3 rounded-full border-2 border-indigo-500 border-t-transparent animate-spin" aria-hidden="true" />
                                    <span>{t('assistant.thinking', { seconds: Math.max(0, Math.floor((now - (conv.busySince ?? now)) / 1000)) })}</span>
                                    <Button size="sm" variant="outline" className="ml-auto" onClick={stopTurn}>{t('assistant.stop')}</Button>
                                </div>
                            )}
                        </div>
                    )}

                    <div className="border-t p-3 flex items-end gap-2">
                        <textarea
                            ref={inputRef}
                            value={input}
                            maxLength={MAX_MESSAGE_CHARS}
                            rows={Math.min(5, Math.max(1, input.split('\n').length))}
                            disabled={!ready}
                            placeholder={t('assistant.placeholder')}
                            aria-label={t('assistant.placeholder')}
                            className="flex-1 resize-none rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:opacity-50"
                            onChange={(e) => setInput(e.target.value)}
                            onKeyDown={(e) => {
                                if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
                                    e.preventDefault();
                                    submit();
                                }
                            }}
                        />
                        <Button size="icon" onClick={() => submit()} disabled={!ready || conv.busy || !input.trim()} title={t('assistant.send')} aria-label={t('assistant.send')}>
                            <svg xmlns="http://www.w3.org/2000/svg" {...iconProps}><path d="m22 2-7 20-4-9-9-4Z" /><path d="M22 2 11 13" /></svg>
                        </Button>
                    </div>
                </div>
            )}

            <button
                type="button"
                onClick={() => setOpen(o => !o)}
                aria-label={t('assistant.open')}
                title={t('assistant.open')}
                className="fixed bottom-6 right-6 z-50 h-14 w-14 rounded-full bg-indigo-600 text-white shadow-lg hover:bg-indigo-700 active:scale-95 transition-all flex items-center justify-center focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400"
            >
                <svg xmlns="http://www.w3.org/2000/svg" width="24" height="24" viewBox="0 0 24 24" fill="currentColor"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z" /><path d="M19 3l.8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8z" opacity=".7" /></svg>
                {hasPending && !open && <span className="absolute top-1 right-1 h-3 w-3 rounded-full bg-amber-400 ring-2 ring-white" aria-hidden="true" />}
            </button>
        </>
    );
}
