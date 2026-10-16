import type { ChatMessage, ChatRequest, ChatResult } from '../types.ts';
import { AiError } from '../types.ts';
import { extractJson } from '../json.ts';
import type { JsonRepair } from '../json.ts';
import type { ResolvedPlan, ResolveResult } from '../actions/types.ts';
import { MAX_QUERY_ROUNDS, buildPlanFormatSchema } from '../actions/specs.ts';
import type { BuiltContext, ScreenInfo } from './context.ts';
import { NOT_JSON_FEEDBACK, PREVIOUS_PLAN_NOTE, buildSystemPrompt, retryFeedback } from './prompt.ts';
import { formatQueryResults, parseQueries } from './queries.ts';
import { stripIds } from './reply.ts';

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
    /** Runs one read tool for the `queries` step (see queries.ts). Errors are returned as `{ error }`, not thrown. */
    runQuery(tool: string, args: Record<string, unknown>): unknown;
}

interface Success {
    reply: string;
    /** Normalised JSON of the plan: what goes into the history. */
    assistantJson: string;
    attempts: number;
    jsonRepaired: JsonRepair;
    /** How many query rounds the model used before answering. */
    queryRounds: number;
}

export type TurnResult =
    | ({ kind: 'reply' } & Success)
    | ({ kind: 'plan'; plan: ResolvedPlan } & Success)
    | { kind: 'invalid'; problems: string[]; attempts: number }
    | { kind: 'provider'; error: AiError }
    | { kind: 'aborted' };

const MAX_ATTEMPTS = 2;
/** The final answer is stored without leftover (empty) `queries`. */
function stripQueries(value: unknown): unknown {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return value;
    const rest = { ...(value as Record<string, unknown>) };
    delete rest.queries;
    return rest;
}

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
    let attempt = 1;
    let queryRounds = 0;
    while (attempt <= MAX_ATTEMPTS) {
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
            const asked = parseQueries(parsed.value);
            if (asked && 'queries' in asked) {
                if (queryRounds < MAX_QUERY_ROUNDS) {
                    // Data requests do not use up the retry: they are a normal part of answering.
                    queryRounds++;
                    const results = asked.queries.map(q => deps.runQuery(q.tool, q.args));
                    messages = [
                        ...messages,
                        { role: 'assistant', content },
                        { role: 'user', content: formatQueryResults(asked.queries, results, { last: queryRounds >= MAX_QUERY_ROUNDS, request: input.userText }) },
                    ];
                    continue;
                }
                problems = ['лимит запросов исчерпан: ответь по уже полученным данным, без queries'];
            } else if (asked) {
                problems = asked.problems;
            } else {
                const resolved = deps.resolve(parsed.value);
                if (!resolved.ok) {
                    problems = resolved.issues.map(i => i.message);
                } else if (resolved.plan.mutations.length === 0 && !resolved.plan.reply.trim()) {
                    problems = [EMPTY_PLAN_FEEDBACK];
                } else {
                    const success: Success = {
                        reply: stripIds(resolved.plan.reply, input.userText),
                        assistantJson: JSON.stringify(stripQueries(parsed.value)),
                        attempts: attempt,
                        jsonRepaired: parsed.repaired,
                        queryRounds,
                    };
                    return resolved.plan.mutations.length === 0
                        ? { kind: 'reply', ...success }
                        : { kind: 'plan', plan: resolved.plan, ...success };
                }
            }
        }
        if (attempt < MAX_ATTEMPTS) {
            messages = [...messages, { role: 'assistant', content }, { role: 'user', content: retryFeedback(problems) }];
        }
        attempt++;
    }
    return { kind: 'invalid', problems, attempts: MAX_ATTEMPTS };
}
