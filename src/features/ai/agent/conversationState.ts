import type { AiErrorKind, AiMode, ChatMessage } from '../types.ts';
import type { Counts, ResolvedPlan } from '../actions/types.ts';
import type { PreviousPlan } from './agent.ts';

/*
 * Conversation state as plain data + pure transitions, so it can be tested in Node and lives outside React
 * (the dialogue survives closing the window; "Новый диалог" and an app restart clear it). Messages carry codes and
 * parameters, not localized text, so a language switch re-renders them correctly.
 */

export type PlanStatus = 'pending' | 'executed' | 'rejected' | 'superseded' | 'stale' | 'failed' | 'undone';

export interface PlanOutcome {
    counts?: Counts;
    undo?: 'saved' | 'failed' | 'none';
    message?: string;
}

export type UiMessage =
    | { id: string; kind: 'user'; text: string }
    | { id: string; kind: 'assistant'; text: string }
    | { id: string; kind: 'plan'; reply: string; plan: ResolvedPlan; status: PlanStatus; outcome?: PlanOutcome; attempts: number }
    | { id: string; kind: 'error'; code: 'invalid' | 'provider' | 'undo_conflict' | 'undo_error'; problems?: string[]; ai?: { kind: AiErrorKind; detail?: string; mode: AiMode } }
    | { id: string; kind: 'info'; code: 'undone' | 'aborted'; labels?: string[] };

export type PlanMessage = Extract<UiMessage, { kind: 'plan' }>;

export interface ConversationState {
    messages: UiMessage[];
    busy: boolean;
    busySince: number | null;
    history: ChatMessage[];
    lastUserText: string | null;
}

export const HISTORY_MAX_TURNS = 8;
export const HISTORY_MAX_CHARS = 12000;

export const initialConversation = (): ConversationState => ({ messages: [], busy: false, busySince: null, history: [], lastUserText: null });

/** Drops whole turns (a user message + its assistant reply), oldest first. */
export function trimHistory(history: ChatMessage[], maxTurns = HISTORY_MAX_TURNS, maxChars = HISTORY_MAX_CHARS): ChatMessage[] {
    let pairs: ChatMessage[][] = [];
    for (let i = 0; i + 1 < history.length; i += 2) pairs.push([history[i], history[i + 1]]);
    pairs = pairs.slice(-maxTurns);
    const size = (ps: ChatMessage[][]) => ps.reduce((n, p) => n + p[0].content.length + p[1].content.length, 0);
    while (pairs.length > 1 && size(pairs) > maxChars) pairs.shift();
    return pairs.flat();
}

/** Adds the user's message. A pending plan stays pending until a newer plan replaces it or the user rejects it. */
export function appendUser(s: ConversationState, id: string, text: string): ConversationState {
    return { ...s, lastUserText: text, messages: [...s.messages, { id, kind: 'user', text }] };
}

/** Adds a plan card; any older plan that is still pending can no longer be executed. */
export function appendPlan(s: ConversationState, plan: Extract<UiMessage, { kind: 'plan' }>): ConversationState {
    return {
        ...s,
        messages: [...s.messages.map(m => (m.kind === 'plan' && m.status === 'pending' ? { ...m, status: 'superseded' as const } : m)), plan],
    };
}

export function setBusy(s: ConversationState, busy: boolean, now: number | null = null): ConversationState {
    return { ...s, busy, busySince: busy ? now : null };
}

/** A successful turn: stores the pair in the model history. */
export function commitTurn(s: ConversationState, userText: string, assistantJson: string): ConversationState {
    return { ...s, history: trimHistory([...s.history, { role: 'user', content: userText }, { role: 'assistant', content: assistantJson }]) };
}

export const appendMessage = (s: ConversationState, m: UiMessage): ConversationState => ({ ...s, messages: [...s.messages, m] });

export function patchPlan(s: ConversationState, id: string, patch: { status?: PlanStatus; outcome?: PlanOutcome }): ConversationState {
    return { ...s, messages: s.messages.map(m => (m.kind === 'plan' && m.id === id ? { ...m, ...patch } : m)) };
}

export function findPlan(s: ConversationState, id: string): Extract<UiMessage, { kind: 'plan' }> | null {
    const m = s.messages.find(x => x.kind === 'plan' && x.id === id);
    return m && m.kind === 'plan' ? m : null;
}

/** The newest executed plan that has not been undone (the only one the Undo button can address). */
export function latestExecutedPlan(s: ConversationState): Extract<UiMessage, { kind: 'plan' }> | null {
    for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i];
        if (m.kind === 'plan' && m.status === 'executed') return m;
    }
    return null;
}

/** What happened to the last plan, for the one-line note in front of the next request. */
export function previousPlanState(s: ConversationState): PreviousPlan {
    for (let i = s.messages.length - 1; i >= 0; i--) {
        const m = s.messages[i];
        if (m.kind !== 'plan') continue;
        if (m.status === 'pending') return 'pending';
        if (m.status === 'executed') return 'executed';
        return 'rejected';
    }
    return 'none';
}

export function createConversationStore(initial: ConversationState = initialConversation()) {
    let state = initial;
    const listeners = new Set<() => void>();
    return {
        getState: () => state,
        subscribe(fn: () => void) {
            listeners.add(fn);
            return () => { listeners.delete(fn); };
        },
        /** Replaces the state (never mutates it) and notifies subscribers once. */
        update(fn: (s: ConversationState) => ConversationState) {
            state = fn(state);
            listeners.forEach(l => l());
        },
        reset() {
            state = initialConversation();
            listeners.forEach(l => l());
        },
    };
}
