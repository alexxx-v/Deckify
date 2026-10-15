import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { dbRead } from '@/db/schema';
import { getDirtyTaskId } from '@/lib/editorState';
import { loadAiConfig } from '../aiConfig';
import { createOllamaProvider } from '../ollamaProvider';
import { createIpcTransport, isAiAvailable, keyStore } from '../transport';
import { AiError } from '../types';
import { executeAiPlan, getAiUndoInfo, resolveAiPlan, undoAiPlan } from '../actions/runtime';
import type { ResolvedPlan } from '../actions/types';
import { runAgentTurn } from './agent';
import type { TurnResult } from './agent';
import { buildContext } from './context';
import type { ScreenInfo } from './context';
import { conversation } from './conversation';
import * as cs from './conversationState';

/*
 * The assistant's behaviour wired to the running app: configuration, the Ollama provider, the Phase 3 registry
 * and the conversation store. The UI only calls these functions and renders the store. All of it is
 * renderer-side and needs the desktop app, so the pure parts live in agent.ts / conversationState.ts (Node-tested).
 */

export const MAX_MESSAGE_CHARS = 4000;

export type Readiness = 'ok' | 'no_model' | 'no_key' | 'unavailable';

/** What the views must refresh or close after a plan or an undo changed the data. */
export interface DataChange {
    touchedTaskIds: string[];
    removedTaskIds: string[];
    removedProjectIds: string[];
}

export type ConfirmResult = { needsConfirm: true; taskId: string } | { needsConfirm: false };

let dataChangedHandler: ((change: DataChange) => void) | null = null;
let controller: AbortController | null = null;
/** Bumped by "new dialog" so a turn that finishes afterwards cannot write into the fresh conversation. */
let epoch = 0;

const today = () => dayjs().format('YYYY-MM-DD');
const newId = () => uuidv4();

/** Registers who is told about data changes (App). Returns the unregister function. */
export function setDataChangedHandler(handler: (change: DataChange) => void): () => void {
    dataChangedHandler = handler;
    return () => { if (dataChangedHandler === handler) dataChangedHandler = null; };
}

function notifyDataChanged(change: DataChange) {
    if (change.touchedTaskIds.length || change.removedTaskIds.length || change.removedProjectIds.length) dataChangedHandler?.(change);
}

export async function getReadiness(): Promise<Readiness> {
    if (!isAiAvailable()) return 'unavailable';
    const config = loadAiConfig();
    if (!config.model) return 'no_model';
    if (config.mode === 'cloud' && !(await keyStore.status()).hasKey) return 'no_key';
    return 'ok';
}

export async function sendMessage(text: string, screen: ScreenInfo): Promise<void> {
    const before = conversation.getState();
    const userText = text.trim().slice(0, MAX_MESSAGE_CHARS);
    if (!userText || before.busy) return;

    const previousPlan = cs.previousPlanState(before);
    conversation.update(s => cs.setBusy(cs.appendUser(s, newId(), userText), true, Date.now()));

    const myEpoch = epoch;
    const config = loadAiConfig();
    const provider = createOllamaProvider(config, createIpcTransport());
    const abort = new AbortController();
    controller = abort;

    let result: TurnResult;
    try {
        result = await runAgentTurn(
            { userText, history: before.history, screen, previousPlan, signal: abort.signal },
            {
                chat: req => provider.chat(req),
                resolve: resolveAiPlan,
                context: s => dbRead(ops => buildContext(ops, { today: today(), screen: s })),
                today,
            },
        );
    } catch (err) {
        // The database closed or the context could not be built: shown as a provider-level problem.
        result = { kind: 'provider', error: new AiError('bad_response', err instanceof Error ? err.message : String(err)) };
    }
    if (controller === abort) controller = null;
    if (myEpoch !== epoch) return;

    conversation.update(s => {
        const done = cs.setBusy(s, false);
        switch (result.kind) {
            case 'reply':
                return cs.commitTurn(cs.appendMessage(done, { id: newId(), kind: 'assistant', text: result.reply }), userText, result.assistantJson);
            case 'plan':
                return cs.commitTurn(
                    cs.appendPlan(done, { id: newId(), kind: 'plan', reply: result.reply, plan: result.plan, status: 'pending', attempts: result.attempts }),
                    userText,
                    result.assistantJson,
                );
            case 'invalid':
                return cs.appendMessage(done, { id: newId(), kind: 'error', code: 'invalid', problems: result.problems });
            case 'provider':
                return cs.appendMessage(done, { id: newId(), kind: 'error', code: 'provider', ai: { kind: result.error.kind, detail: result.error.detail, mode: config.mode } });
            case 'aborted':
                return cs.appendMessage(done, { id: newId(), kind: 'info', code: 'aborted' });
        }
    });
}

/** Re-asks the last request (after a stale plan). */
export function replan(screen: ScreenInfo): Promise<void> {
    const last = conversation.getState().lastUserText;
    return last ? sendMessage(last, screen) : Promise.resolve();
}

export function stopTurn(): void {
    controller?.abort();
}

export function newDialog(): void {
    epoch++;
    controller?.abort();
    controller = null;
    conversation.reset();
}

export function rejectPlan(id: string): void {
    const plan = cs.findPlan(conversation.getState(), id);
    if (plan?.status === 'pending') conversation.update(s => cs.patchPlan(s, id, { status: 'rejected' }));
}

function changeFromPlan(plan: ResolvedPlan): DataChange {
    return {
        touchedTaskIds: plan.affectedTaskIds,
        removedTaskIds: plan.mutations.flatMap(m => (m.table === 'tasks' && m.op === 'delete' ? [m.id] : [])),
        removedProjectIds: plan.mutations.flatMap(m => (m.table === 'projects' && m.op === 'delete' ? [m.id] : [])),
    };
}

/**
 * Runs a pending plan after the user's click. If the task form that is open holds unsaved edits and the plan
 * touches that task, nothing happens yet: the card asks, and calls again with `force`.
 */
export function confirmPlan(id: string, opts: { force?: boolean } = {}): ConfirmResult {
    const card = cs.findPlan(conversation.getState(), id);
    if (!card || card.status !== 'pending') return { needsConfirm: false };

    if (!opts.force) {
        const dirty = getDirtyTaskId();
        if (dirty && card.plan.affectedTaskIds.includes(dirty)) return { needsConfirm: true, taskId: dirty };
    }

    const result = executeAiPlan(card.plan);
    if (result.ok) {
        conversation.update(s => cs.patchPlan(s, id, { status: 'executed', outcome: { counts: result.counts, undo: result.undo, message: result.undoError } }));
        notifyDataChanged(changeFromPlan(card.plan));
    } else if (result.reason === 'stale') {
        conversation.update(s => cs.patchPlan(s, id, { status: 'stale' }));
    } else {
        conversation.update(s => cs.patchPlan(s, id, { status: 'failed', outcome: { message: result.message } }));
    }
    return { needsConfirm: false };
}

export function undoLast(): void {
    const result = undoAiPlan();
    if (result.ok) {
        conversation.update(s => {
            const card = cs.findPlan(s, result.planId);
            const marked = card ? cs.patchPlan(s, card.id, { status: 'undone' }) : s;
            return cs.appendMessage(marked, { id: newId(), kind: 'info', code: 'undone', labels: result.summary.map(x => x.label) });
        });
        notifyDataChanged({
            touchedTaskIds: result.touched.filter(e => e.table === 'tasks').map(e => e.id),
            removedTaskIds: result.removed.filter(e => e.table === 'tasks').map(e => e.id),
            removedProjectIds: result.removed.filter(e => e.table === 'projects').map(e => e.id),
        });
        return;
    }
    conversation.update(s => cs.appendMessage(s, result.reason === 'conflict'
        ? { id: newId(), kind: 'error', code: 'undo_conflict', problems: result.conflicts.map(c => c.label) }
        : { id: newId(), kind: 'error', code: 'undo_error', problems: [result.reason === 'error' ? result.message : result.reason] }));
}

export { getAiUndoInfo as getUndoInfo };
