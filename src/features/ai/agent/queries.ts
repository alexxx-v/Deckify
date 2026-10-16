import { MAX_QUERIES_PER_ROUND, MAX_QUERY_RESULT_CHARS, QUERY_ARG_KEYS, QUERY_TOOLS } from '../actions/specs.ts';

/*
 * The "queries" step: when the context is not enough (not every task is shown, a board's members, a task's
 * description) the model answers with `queries` instead of `actions`; the app runs read tools and sends the results
 * back. Everything the model sends is validated here; nothing is run for an invalid request.
 */

export interface Query {
    tool: (typeof QUERY_TOOLS)[number];
    args: Record<string, unknown>;
}

export type ParsedQueries = { queries: Query[] } | { problems: string[] };

const isObj = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isTool = (v: unknown): v is Query['tool'] => typeof v === 'string' && (QUERY_TOOLS as readonly string[]).includes(v);

/**
 * Empty strings, nulls, `false` and 0 are what constrained decoding writes for unused properties: they mean "not set".
 * This includes `overdue: false` — it cannot be told apart from a filler, and treating a filler as "not overdue only"
 * would silently hide the overdue tasks from every query. The tools only offer `overdue: true`.
 */
function cleanArgs(args: Record<string, unknown>): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(args)) {
        if (v === null || v === undefined || v === '' || v === false || v === 0) continue;
        out[k] = v;
    }
    return out;
}

/**
 * `null` — the answer has no queries (carry on as a normal plan / reply).
 * `{ queries }` — valid requests to run. `{ problems }` — rejected; the problems go back to the model.
 */
export function parseQueries(value: unknown): ParsedQueries | null {
    if (!isObj(value) || !Array.isArray(value.queries) || value.queries.length === 0) return null;
    const problems: string[] = [];
    if (Array.isArray(value.actions) && value.actions.length > 0) {
        problems.push('нельзя одновременно запрашивать данные (queries) и менять их (actions): сначала верни только queries');
    }
    if (value.queries.length > MAX_QUERIES_PER_ROUND) {
        problems.push(`за один раз можно не больше ${MAX_QUERIES_PER_ROUND} запросов, получено ${value.queries.length}`);
    }
    const queries: Query[] = [];
    value.queries.slice(0, MAX_QUERIES_PER_ROUND).forEach((q, i) => {
        const where = `Запрос ${i + 1}`;
        if (!isObj(q) || !isTool(q.tool)) {
            problems.push(`${where}: tool должен быть одним из ${QUERY_TOOLS.join(', ')}`);
            return;
        }
        const args = cleanArgs(isObj(q.args) ? q.args : {});
        const allowed = QUERY_ARG_KEYS[q.tool];
        const bad = Object.keys(args).filter(k => !allowed.includes(k));
        if (bad.length) problems.push(`${where}: у ${q.tool} нет аргументов ${bad.join(', ')}${allowed.length ? `; допустимы ${allowed.join(', ')}` : ' (аргументов нет)'}`);
        else queries.push({ tool: q.tool, args });
    });
    return problems.length ? { problems } : { queries };
}

/** The message that carries the answers back to the model. Each result is capped and flagged when cut. */
export function formatQueryResults(queries: Query[], results: unknown[], opts: { last: boolean; request: string }): string {
    const blocks = queries.map((q, i) => {
        const json = JSON.stringify(results[i]);
        const text = json.length > MAX_QUERY_RESULT_CHARS
            ? `${json.slice(0, MAX_QUERY_RESULT_CHARS)} …обрезано (всего ${json.length} символов; сузь запрос фильтрами)`
            : json;
        return `${q.tool}(${JSON.stringify(q.args)}) → ${text}`;
    });
    // The current request is repeated so that it is not buried under the results (and an old plan is not replayed).
    const ask = `Ответь на текущий запрос пользователя: «${opts.request}». Прежний план повторять не нужно. Задачи называй по названию, id в ответе не показывай.`;
    return `Результаты запросов:\n${blocks.join('\n')}\n${opts.last
        ? `Больше запросов нельзя. ${ask}`
        : ask}`;
}
