import type { ChatMessage, ChatRequest, ChatResult } from '../types.ts';
import { AiError } from '../types.ts';
import { extractJson } from '../json.ts';
import type { JsonRepair } from '../json.ts';
import type { ResolvedPlan, ResolveResult } from '../actions/types.ts';
import { buildPlanFormatSchema } from '../actions/specs.ts';
import type { BuiltContext, ScreenInfo } from './context.ts';
import { NOT_JSON_FEEDBACK, PREVIOUS_PLAN_NOTE, buildSystemPrompt, retryFeedback } from './prompt.ts';

/*
 * One user turn: build the messages, ask the model, parse + validate + resolve the plan, and give the model ONE
 * chance to fix a rejected plan (the policy the spike measured). Expected failures are returned as values, never
 * thrown, and the failed exchange is not part of the result — callers store only the successful assistant JSON
 * in the conversation history.
 */

export type PreviousPlan = 'none' | 'executed' | 'rejected' | 'pending';

export interface TurnInput {
    userText: string;
    /** Earlier turns: user texts (no context block) and the assistant's plan JSON. */
    history: ChatMessage[];
    screen: ScreenInfo;
    previousPlan: PreviousPlan;
    signal?: AbortSignal;
}

export interface TurnDeps {
    chat(req: ChatRequest): Promise<ChatResult>;
    resolve(value: unknown): ResolveResult;
    context(screen: ScreenInfo): BuiltContext;
    today(): string;
}

interface Success {
    reply: string;
    /** Normalised JSON of the plan: what goes into the history. */
    assistantJson: string;
    attempts: number;
    jsonRepaired: JsonRepair;
}

export type TurnResult =
    | ({ kind: 'reply' } & Success)
    | ({ kind: 'plan'; plan: ResolvedPlan } & Success)
    | { kind: 'invalid'; problems: string[]; attempts: number }
    | { kind: 'provider'; error: AiError }
    | { kind: 'aborted' };

const MAX_ATTEMPTS = 2;
const EMPTY_PLAN_FEEDBACK = 'пустой ответ: добавь действия или текст в reply';

export async function runAgentTurn(input: TurnInput, deps: TurnDeps): Promise<TurnResult> {
    const context = deps.context(input.screen);
    const note = input.previousPlan === 'none' ? '' : `${PREVIOUS_PLAN_NOTE[input.previousPlan]}\n`;
    let messages: ChatMessage[] = [
        { role: 'system', content: buildSystemPrompt(deps.today()) },
        ...input.history,
        { role: 'user', content: `${note}${context.text}\n\nЗапрос: ${input.userText}` },
    ];
    const format = buildPlanFormatSchema();

    let problems: string[] = [];
    for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
        if (input.signal?.aborted) return { kind: 'aborted' };

        let content: string;
        try {
            content = (await deps.chat({ messages, format, signal: input.signal })).message.content;
        } catch (e) {
            if (e instanceof AiError) return e.kind === 'aborted' ? { kind: 'aborted' } : { kind: 'provider', error: e };
            return { kind: 'provider', error: new AiError('bad_response', e instanceof Error ? e.message : String(e)) };
        }
        if (input.signal?.aborted) return { kind: 'aborted' };

        const parsed = extractJson(content);
        if ('error' in parsed) {
            problems = [NOT_JSON_FEEDBACK];
        } else {
            const resolved = deps.resolve(parsed.value);
            if (!resolved.ok) {
                problems = resolved.issues.map(i => i.message);
            } else if (resolved.plan.mutations.length === 0 && !resolved.plan.reply.trim()) {
                problems = [EMPTY_PLAN_FEEDBACK];
            } else {
                const success: Success = {
                    reply: resolved.plan.reply,
                    assistantJson: JSON.stringify(parsed.value),
                    attempts: attempt,
                    jsonRepaired: parsed.repaired,
                };
                return resolved.plan.mutations.length === 0
                    ? { kind: 'reply', ...success }
                    : { kind: 'plan', plan: resolved.plan, ...success };
            }
        }
        if (attempt < MAX_ATTEMPTS) {
            messages = [...messages, { role: 'assistant', content }, { role: 'user', content: retryFeedback(problems) }];
        }
    }
    return { kind: 'invalid', problems, attempts: MAX_ATTEMPTS };
}
