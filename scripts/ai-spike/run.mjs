#!/usr/bin/env node
/*
 * Phase 1 spike runner.
 *   node scripts/ai-spike/run.mjs --model gpt-oss:120b-cloud --mode format [--runs 3] [--retry]
 *        [--base-url http://localhost:11434] [--think low|medium|high|true|false] [--cases id,id] [--delay 300]
 *
 * Sends every case to Ollama /api/chat, parses the plan (tool calls or structured JSON), scores it
 * with score.mjs, and writes raw request/response per run to scripts/ai-spike/results/.
 * Re-running resumes: result files that already exist are reused, not re-requested.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { TODAY, contextFor } from './fixtures.mjs';
import { cases } from './cases.mjs';
import { STATUSES, compare, feedback, normalize, tryParseJson } from './score.mjs';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const RESULTS = path.join(HERE, 'results');

// ---- args -----------------------------------------------------------------------------------------
const argv = process.argv.slice(2);
const flag = name => argv.includes(`--${name}`);
const opt = (name, def) => {
    const i = argv.indexOf(`--${name}`);
    return i >= 0 && argv[i + 1] && !argv[i + 1].startsWith('--') ? argv[i + 1] : def;
};
const MODEL = opt('model');
const MODE = opt('mode');
const RUNS = Number(opt('runs', 3));
const RETRY = flag('retry');
const BASE = opt('base-url', 'http://localhost:11434').replace(/\/$/, '');
const DELAY = Number(opt('delay', 300));
const ONLY = opt('cases')?.split(',');
const THINK = opt('think');
const NUM_CTX = Number(opt('num-ctx', 16384));
if (!MODEL || !['tools', 'format'].includes(MODE)) {
    console.error('usage: node scripts/ai-spike/run.mjs --model <name> --mode tools|format [--runs N] [--retry] [--think low|medium|high|true|false]');
    process.exit(2);
}

// ---- plan format: one definition feeds both mechanisms --------------------------------------------
const P = {
    project: { type: 'string', description: 'Название проекта или его id из контекста' },
    name: { type: 'string', description: 'Новое название' },
    title: { type: 'string', description: 'Название задачи' },
    description: { type: 'string', description: 'Описание задачи в markdown' },
    start: { type: 'string', description: 'Дата старта: today, +3d, -1w, +1m или YYYY-MM-DD. Не вычисляй дату сам.' },
    duration: { type: 'string', description: 'Длительность: 7d (дни), 2w (недели) или 1m (месяцы)' },
    steps: { type: 'array', items: { type: 'string' }, description: 'Шаги (чек-лист) задачи' },
    status: { type: 'string', enum: STATUSES },
    ids: { type: 'array', items: { type: 'string' }, description: 'id задач строго из контекста' },
    filter: {
        type: 'object',
        description: 'Какие задачи затронуть. Хотя бы одно поле.',
        properties: {
            project: { type: 'string', description: 'Название проекта или id' },
            status: { type: 'string', enum: STATUSES },
            ids: { type: 'array', items: { type: 'string' }, description: 'id задач строго из контекста' },
        },
    },
    set: {
        type: 'object',
        description: 'Что изменить. Хотя бы одно поле.',
        properties: {
            shift: { type: 'string', description: 'Сдвиг даты старта у каждой задачи: +1w, -3d, +1m' },
            start: { type: 'string', description: 'Новая дата старта: today, +3d или YYYY-MM-DD' },
            duration: { type: 'string', description: 'Новая длительность: 7d, 2w, 1m' },
            status: { type: 'string', enum: STATUSES },
            title: { type: 'string' },
        },
    },
};

const ACTIONS = [
    { type: 'create_task', description: 'Создать задачу в проекте.', props: ['project', 'title', 'description', 'start', 'duration', 'steps', 'status'], required: ['project', 'title', 'start', 'duration'] },
    { type: 'update_tasks', description: 'Изменить существующие задачи (в том числе массово).', props: ['filter', 'set'], required: ['filter', 'set'] },
    { type: 'delete_tasks', description: 'Удалить задачи по id.', props: ['ids'], required: ['ids'] },
    { type: 'create_project', description: 'Создать проект.', props: ['name'], required: ['name'] },
    { type: 'rename_project', description: 'Переименовать проект.', props: ['project', 'name'], required: ['project', 'name'] },
    { type: 'delete_project', description: 'Удалить проект вместе со всеми его задачами.', props: ['project'], required: ['project'] },
];

/** Mechanism A: one tool per action. */
const TOOLS = ACTIONS.map(a => ({
    type: 'function',
    function: {
        name: a.type,
        description: a.description,
        parameters: { type: 'object', properties: Object.fromEntries(a.props.map(k => [k, P[k]])), required: a.required },
    },
}));

/** Mechanism B: one flat object schema (a flat shape decodes more reliably than oneOf on small models). */
const FORMAT = {
    type: 'object',
    properties: {
        reply: { type: 'string', description: 'Короткий ответ пользователю: описание плана, уточняющий вопрос или ответ на вопрос о данных' },
        actions: {
            type: 'array',
            items: {
                type: 'object',
                properties: { type: { type: 'string', enum: ACTIONS.map(a => a.type) }, ...Object.fromEntries(Object.keys(P).map(k => [k, P[k]])) },
                required: ['type'],
            },
        },
    },
    required: ['reply', 'actions'],
};

const SYSTEM = `Ты — ассистент по управлению задачами в приложении Deckify. Пользователь пишет по-русски. Ты составляешь план действий над проектами и задачами; приложение само проверит его и выполнит после подтверждения пользователя.

Правила:
- Сегодня ${TODAY}.
- Проекты указывай по названию или id из контекста, существующие задачи — только по id из контекста. Никогда не выдумывай id. Для новых задач и проектов id не нужен: приложение создаст его само.
- Даты задавай только токенами: today, +Nd, -Nd, +Nw, -Nw, +Nm, -Nm или YYYY-MM-DD. Сам даты не вычисляй.
- Длительность — только Nd (дни), Nw (недели), Nm (месяцы).
- Чтобы сдвинуть даты существующих задач, используй set.shift (например +1w), а не новые даты.
- Описание задачи пиши в markdown, шаги — короткими пунктами.
- Если запрос неоднозначен или не хватает данных, не добавляй действий и задай уточняющий вопрос.
- Если пользователь задаёт вопрос о данных, ответь на него, не добавляя действий.
- Если действия есть, кратко опиши план в reply.`;

// With `format` the schema only constrains decoding; the model does not see it, so it is repeated in the prompt.
const TAIL = {
    tools: '\nДля действий вызывай инструменты. Для вопросов и уточнений отвечай обычным текстом.',
    format: `\nОтветь одним JSON-объектом по схеме (других ключей и типов действий нет):\n${JSON.stringify(FORMAT, null, 1)}\nПоле type каждого действия — одно из: ${ACTIONS.map(a => a.type).join(', ')}. Заполняй только поля, нужные этому действию:\n${ACTIONS.map(a => `- ${a.type}: ${a.props.join(', ')} (обязательны: ${a.required.join(', ')}) — ${a.description}`).join('\n')}`,
};

// ---- Ollama ---------------------------------------------------------------------------------------
async function chat(messages) {
    const body = {
        model: MODEL,
        messages,
        stream: false,
        options: { temperature: 0.2, num_ctx: NUM_CTX },
    };
    if (MODE === 'tools') body.tools = TOOLS;
    else body.format = FORMAT;
    if (THINK !== undefined) body.think = ['true', 'false'].includes(THINK) ? THINK === 'true' : THINK;

    const t0 = performance.now();
    try {
        const res = await fetch(`${BASE}/api/chat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body),
            signal: AbortSignal.timeout(240_000),
        });
        const latencyMs = Math.round(performance.now() - t0);
        const text = await res.text();
        if (!res.ok) return { request: body, latencyMs, httpError: `HTTP ${res.status}: ${text.slice(0, 300)}` };
        return { request: body, latencyMs, response: JSON.parse(text) };
    } catch (e) {
        return { request: body, latencyMs: Math.round(performance.now() - t0), httpError: String(e?.message ?? e) };
    }
}

async function supportsTools() {
    try {
        const res = await fetch(`${BASE}/api/show`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: MODEL }),
            signal: AbortSignal.timeout(15_000),
        });
        if (!res.ok) return true; // cannot tell — try it and let the run speak
        const info = await res.json();
        return !info.capabilities || info.capabilities.includes('tools');
    } catch {
        return true;
    }
}

/** Ollama response → { plan, problems } where problems are failures that happen before scoring. */
function extractPlan(response) {
    const msg = response?.message ?? {};
    if (MODE === 'format') {
        const parsed = tryParseJson(msg.content ?? '');
        if ('error' in parsed) return { problems: [{ cls: 'invalid_json', msg: parsed.error }] };
        return { plan: parsed.value, problems: [] };
    }
    const actions = [];
    const problems = [];
    for (const call of msg.tool_calls ?? []) {
        let args = call.function?.arguments ?? {};
        if (typeof args === 'string') {
            const parsed = tryParseJson(args);
            if ('error' in parsed) { problems.push({ cls: 'invalid_json', msg: `аргументы ${call.function?.name}: ${parsed.error}` }); continue; }
            args = parsed.value;
        }
        actions.push({ type: call.function?.name, ...args });
    }
    return { plan: { reply: msg.content ?? '', actions }, problems };
}

function score(response, expected) {
    const { plan, problems } = extractPlan(response);
    if (problems.length) return { ok: false, failures: problems };
    return compare(normalize(plan), expected);
}

// ---- run ------------------------------------------------------------------------------------------
const slug = s => s.replace(/[^a-zA-Z0-9.-]+/g, '_');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const median = xs => (xs.length ? [...xs].sort((a, b) => a - b)[Math.floor(xs.length / 2)] : null);

async function runOne(c, run) {
    const file = path.join(RESULTS, `${slug(MODEL)}__${MODE}__${c.id}__${run}.json`);
    if (fs.existsSync(file)) {
        const prev = JSON.parse(fs.readFileSync(file, 'utf8'));
        if (!RETRY || prev.retry || prev.first.ok) return prev;
    }

    const messages = [
        { role: 'system', content: SYSTEM + TAIL[MODE] },
        { role: 'user', content: `${contextFor(c.screen)}\n\nЗапрос: ${c.user}` },
    ];
    const a = await chat(messages);
    const first = a.httpError
        ? { ok: false, failures: [{ cls: 'http_error', msg: a.httpError }] }
        : score(a.response, c.expected);
    const out = {
        case: c.id, model: MODEL, mode: MODE, run, latencyMs: a.latencyMs,
        first, request: a.request, response: a.response ?? null,
    };

    if (RETRY && !first.ok && !a.httpError) {
        const followUp = [
            ...messages,
            a.response.message,
            { role: 'user', content: `План не принят приложением:\n${feedback(first.failures)}\nИсправь план.` },
        ];
        const b = await chat(followUp);
        out.retry = b.httpError
            ? { ok: false, failures: [{ cls: 'http_error', msg: b.httpError }], latencyMs: b.latencyMs }
            : { ...score(b.response, c.expected), latencyMs: b.latencyMs, response: b.response };
    }

    fs.mkdirSync(RESULTS, { recursive: true });
    fs.writeFileSync(file, JSON.stringify(out, null, 2));
    await sleep(DELAY);
    return out;
}

if (MODE === 'tools' && !(await supportsTools())) {
    console.log(`SKIP ${MODEL} --mode tools: model does not report the "tools" capability`);
    fs.mkdirSync(RESULTS, { recursive: true });
    fs.writeFileSync(path.join(RESULTS, `summary__${slug(MODEL)}__${MODE}.json`), JSON.stringify({ model: MODEL, mode: MODE, skipped: 'no tools capability' }, null, 2));
    process.exit(0);
}

const selected = cases.filter(c => !ONLY || ONLY.includes(c.id));
const rows = [];
for (const c of selected) {
    const outs = [];
    for (let run = 1; run <= RUNS; run++) outs.push(await runOne(c, run));
    const ok1 = outs.filter(o => o.first.ok).length;
    const okR = outs.filter(o => o.first.ok || o.retry?.ok).length;
    const classes = {};
    for (const o of outs) if (!o.first.ok) for (const f of new Set(o.first.failures.map(f => f.cls))) classes[f] = (classes[f] ?? 0) + 1;
    rows.push({ case: c.id, runs: RUNS, ok: ok1, okAfterRetry: RETRY ? okR : null, classes, medianMs: median(outs.map(o => o.latencyMs)) });
    console.log(`${c.id.padEnd(16)} ${ok1}/${RUNS}${RETRY ? `  retry→${okR}/${RUNS}` : ''}  ${String(median(outs.map(o => o.latencyMs))).padStart(6)} ms  ${JSON.stringify(classes)}`);
}

const total = rows.length * RUNS;
const ok = rows.reduce((s, r) => s + r.ok, 0);
const okRetry = rows.reduce((s, r) => s + (r.okAfterRetry ?? 0), 0);
const errors = rows.reduce((s, r) => s + (r.classes.http_error ?? 0), 0);
const summary = {
    model: MODEL, mode: MODE, retry: RETRY, think: THINK ?? null, runsPerCase: RUNS, total, ok,
    accuracy: +(ok / total).toFixed(3),
    accuracyAfterRetry: RETRY ? +(okRetry / total).toFixed(3) : null,
    httpErrors: errors, medianMs: median(rows.map(r => r.medianMs)), rows,
};
fs.mkdirSync(RESULTS, { recursive: true });
fs.writeFileSync(path.join(RESULTS, `summary__${slug(MODEL)}__${MODE}${RETRY ? '__retry' : ''}.json`), JSON.stringify(summary, null, 2));
console.log(`\n${MODEL} [${MODE}] accuracy ${ok}/${total} (${(summary.accuracy * 100).toFixed(0)}%)` + (RETRY ? `, after retry ${okRetry}/${total}` : '') + (errors ? `, http errors: ${errors}` : ''));
