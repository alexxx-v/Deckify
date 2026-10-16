import dayjs from 'dayjs';
import { fileURLToPath } from 'node:url';
import { TODAY, projects, tasks } from './fixtures.mjs';

/*
 * Plan normalizer + scorer.
 *
 * A model plan ({ reply, actions[] }, date/duration TOKENS, names or ids) is resolved the way the
 * app will resolve it — tokens via dayjs, names to ids — and flattened into per-entity "effects".
 * Effects are what gets compared, so "one update for three tasks" and "three updates" score the same.
 *
 * Nothing is repaired: an unresolvable id/name is a failure (`unknown_id`), matching the product rule
 * "unknown ID → validation error, not execution". The only leniency is dropping null / '' fields,
 * which constrained-decoding models emit for every unused property of a flat schema.
 */

export const STATUSES = ['backlog', 'progress', 'hold', 'done'];
export const FAILURE_CLASSES = [
    'invalid_json', 'schema_violation', 'unknown_id', 'wrong_target',
    'wrong_date', 'wrong_value', 'missing_action', 'extra_action', 'http_error',
];

const ISO_RE = /^\d{4}-\d{2}-\d{2}$/;
const REL_RE = /^([+-])(\d+)([dwm])$/;
const DUR_RE = /^(\d+)([dwm])$/;
const UNIT = { d: 'day', w: 'week', m: 'month' };
const fmt = d => d.format('YYYY-MM-DD');

/** today | ±Nd/w/m | YYYY-MM-DD → YYYY-MM-DD. Returns null for anything else. */
export function resolveDate(token, base = TODAY) {
    if (token === 'today') return fmt(dayjs(base));
    if (ISO_RE.test(token)) return dayjs(token).isValid() && fmt(dayjs(token)) === token ? token : null;
    const m = REL_RE.exec(token);
    if (!m) return null;
    const n = Number(m[2]) * (m[1] === '-' ? -1 : 1);
    return fmt(dayjs(base).add(n, UNIT[m[3]]));
}

/** Nd/w/m → days. Months use the same rule as TaskEditView.tsx:191-196. */
export function resolveDuration(token, startDate) {
    const m = DUR_RE.exec(token);
    if (!m) return null;
    const n = Number(m[1]);
    if (m[2] === 'd') return n;
    if (m[2] === 'w') return n * 7;
    return dayjs(startDate).add(n, 'month').diff(dayjs(startDate), 'day');
}

/** Strict JSON parse: fenced or prose-wrapped output is `invalid_json`, not silently unwrapped. */
export function tryParseJson(text) {
    try {
        return { value: JSON.parse(text) };
    } catch (e) {
        return { error: `невалидный JSON: ${e.message}` };
    }
}

const isStr = v => typeof v === 'string' && v.trim() !== '';
const isIdList = v => Array.isArray(v) && v.length > 0 && v.every(isStr);

function clean(obj) {
    if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return obj;
    const out = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '') continue;
        out[k] = k === 'filter' || k === 'set' ? clean(v) : v;
    }
    return out;
}

const SET_KEYS = ['shift', 'status', 'title', 'start', 'duration'];
const FILTER_KEYS = ['project', 'status', 'ids'];

/** Returns a list of human-readable (Russian — they go back to the model on retry) schema problems. */
export function validateAction(a) {
    const p = [];
    if (!a || typeof a !== 'object') return ['действие не является объектом'];
    const need = (cond, msg) => { if (!cond) p.push(msg); };
    switch (a.type) {
        case 'create_task':
            need(isStr(a.project), 'create_task: нужен project');
            need(isStr(a.title), 'create_task: нужен title');
            need(typeof a.start === 'string' && resolveDate(a.start) !== null, `create_task: start должен быть today, ±Nd/±Nw/±Nm или YYYY-MM-DD, получено «${a.start}»`);
            need(typeof a.duration === 'string' && DUR_RE.test(a.duration), `create_task: duration должен быть Nd, Nw или Nm, получено «${a.duration}»`);
            need(a.description === undefined || typeof a.description === 'string', 'create_task: description должен быть строкой');
            need(a.steps === undefined || (Array.isArray(a.steps) && a.steps.every(isStr)), 'create_task: steps должен быть массивом строк');
            need(a.status === undefined || STATUSES.includes(a.status), `create_task: status должен быть одним из ${STATUSES.join('/')}, получено «${a.status}»`);
            break;
        case 'update_tasks': {
            const f = a.filter, s = a.set;
            need(f && typeof f === 'object' && Object.keys(f).length > 0, 'update_tasks: нужен непустой filter');
            if (f && typeof f === 'object') {
                const bad = Object.keys(f).filter(k => !FILTER_KEYS.includes(k));
                need(bad.length === 0, `update_tasks: неизвестные поля filter: ${bad.join(', ')}`);
                need(f.status === undefined || STATUSES.includes(f.status), `update_tasks: filter.status некорректен «${f.status}»`);
                need(f.ids === undefined || isIdList(f.ids), 'update_tasks: filter.ids должен быть непустым массивом строк');
            }
            need(s && typeof s === 'object' && Object.keys(s).length > 0, 'update_tasks: нужен непустой set');
            if (s && typeof s === 'object') {
                const bad = Object.keys(s).filter(k => !SET_KEYS.includes(k));
                need(bad.length === 0, `update_tasks: неизвестные поля set: ${bad.join(', ')}`);
                need(s.shift === undefined || (typeof s.shift === 'string' && REL_RE.test(s.shift)), `update_tasks: set.shift должен быть ±Nd/±Nw/±Nm, получено «${s.shift}»`);
                need(s.status === undefined || STATUSES.includes(s.status), `update_tasks: set.status некорректен «${s.status}»`);
                need(s.start === undefined || (typeof s.start === 'string' && resolveDate(s.start) !== null), `update_tasks: set.start некорректен «${s.start}»`);
                need(s.duration === undefined || (typeof s.duration === 'string' && DUR_RE.test(s.duration)), `update_tasks: set.duration некорректен «${s.duration}»`);
                need(!(s.shift && s.start), 'update_tasks: shift и start взаимоисключающие');
            }
            break;
        }
        case 'delete_tasks':
            need(isIdList(a.ids), 'delete_tasks: нужен непустой массив ids');
            break;
        case 'create_project':
            need(isStr(a.name), 'create_project: нужен name');
            break;
        case 'rename_project':
            need(isStr(a.project), 'rename_project: нужен project');
            need(isStr(a.name), 'rename_project: нужен name');
            break;
        case 'delete_project':
            need(isStr(a.project), 'delete_project: нужен project');
            break;
        default:
            p.push(`неизвестный тип действия «${a.type}»`);
    }
    return p;
}

const norm = s => String(s).trim().toLowerCase();

function resolveProject(ref) {
    return projects.find(p => p.id === ref) ?? projects.find(p => norm(p.name) === norm(ref)) ?? null;
}

/**
 * plan → { effects[], problems[{cls,msg}], reply }.
 * Any problem means the plan would be rejected by the app before execution.
 */
export function normalize(plan) {
    const problems = [];
    const effects = [];
    const reply = typeof plan?.reply === 'string' ? plan.reply.trim() : '';
    if (!plan || typeof plan !== 'object' || !Array.isArray(plan.actions ?? [])) {
        problems.push({ cls: 'schema_violation', msg: 'план должен быть объектом с массивом actions' });
        return { effects, problems, reply };
    }
    for (const raw of plan.actions ?? []) {
        const a = clean(raw);
        const bad = validateAction(a);
        if (bad.length) {
            bad.forEach(msg => problems.push({ cls: 'schema_violation', msg }));
            continue;
        }
        const unknownProject = ref => problems.push({ cls: 'unknown_id', msg: `проект «${ref}» не найден в контексте` });
        switch (a.type) {
            case 'create_task': {
                const p = resolveProject(a.project);
                if (!p) { unknownProject(a.project); break; }
                const start = resolveDate(a.start);
                effects.push({
                    op: 'create_task', projectId: p.id, title: a.title, start,
                    durationDays: resolveDuration(a.duration, start), status: a.status ?? 'backlog',
                    hasDescription: isStr(a.description), hasSteps: (a.steps ?? []).length > 0,
                });
                break;
            }
            case 'update_tasks': {
                let set = tasks;
                const f = a.filter;
                if (f.project !== undefined) {
                    const p = resolveProject(f.project);
                    if (!p) { unknownProject(f.project); break; }
                    set = set.filter(t => t.projectId === p.id);
                }
                if (f.status !== undefined) set = set.filter(t => t.status === f.status);
                if (f.ids !== undefined) {
                    const missing = f.ids.filter(id => !tasks.some(t => t.id === id));
                    missing.forEach(id => problems.push({ cls: 'unknown_id', msg: `задача с id «${id}» не найдена в контексте` }));
                    if (missing.length) break;
                    set = set.filter(t => f.ids.includes(t.id));
                }
                for (const t of set) {
                    const e = { op: 'update_task', taskId: t.id };
                    if (a.set.status) e.status = a.set.status;
                    if (a.set.title) e.title = a.set.title;
                    if (a.set.shift) e.start = resolveDate(a.set.shift, t.startDate);
                    if (a.set.start) e.start = resolveDate(a.set.start);
                    if (a.set.duration) e.durationDays = resolveDuration(a.set.duration, e.start ?? t.startDate);
                    effects.push(e);
                }
                break;
            }
            case 'delete_tasks': {
                const missing = a.ids.filter(id => !tasks.some(t => t.id === id));
                missing.forEach(id => problems.push({ cls: 'unknown_id', msg: `задача с id «${id}» не найдена в контексте` }));
                if (!missing.length) a.ids.forEach(id => effects.push({ op: 'delete_task', taskId: id }));
                break;
            }
            case 'create_project':
                effects.push({ op: 'create_project', name: a.name });
                break;
            case 'rename_project': {
                const p = resolveProject(a.project);
                if (!p) { unknownProject(a.project); break; }
                effects.push({ op: 'rename_project', projectId: p.id, name: a.name });
                break;
            }
            case 'delete_project': {
                const p = resolveProject(a.project);
                if (!p) { unknownProject(a.project); break; }
                effects.push({ op: 'delete_project', projectId: p.id });
                break;
            }
        }
    }
    return { effects, problems, reply };
}

const FIELD_CLASS = {
    projectId: 'wrong_target', taskId: 'wrong_target',
    start: 'wrong_date', durationDays: 'wrong_date',
};

const effectKey = (e, i) => {
    if (e.op === 'update_task' || e.op === 'delete_task') return `${e.op}:${e.taskId}`;
    if (e.op === 'rename_project' || e.op === 'delete_project') return `${e.op}:${e.projectId}`;
    return `${e.op}#${i}`;
};

/** Merge several update_task effects on one task into one (a model may split `set` across actions). */
function merged(effects) {
    const out = new Map();
    const seen = {};
    for (const e of effects) {
        const idx = seen[e.op] = (seen[e.op] ?? -1) + 1;
        const key = effectKey(e, idx);
        out.set(key, { ...(out.get(key) ?? {}), ...e });
    }
    return out;
}

const matches = (got, want) => norm(got) === norm(want);

/**
 * Compare normalized plan with an expected case.
 * expected = { effects[] (partial — only listed keys are compared), clarification?, replyIncludes?, replyExcludes? }
 * Returns { ok, failures: [{cls,msg}] }.
 */
export function compare(n, expected) {
    const failures = [...n.problems];
    if (failures.length) return { ok: false, failures };

    const wantEffects = expected.effects ?? [];
    const got = merged(n.effects);
    const want = merged(wantEffects);
    const missing = [], extra = [];

    for (const [key, w] of want) {
        const g = got.get(key);
        if (!g) { missing.push(w); continue; }
        for (const [field, value] of Object.entries(w)) {
            const same = typeof value === 'string' && (field === 'name' || field === 'title')
                ? matches(g[field], value)
                : JSON.stringify(g[field]) === JSON.stringify(value);
            if (!same) {
                failures.push({
                    cls: FIELD_CLASS[field] ?? 'wrong_value',
                    msg: `${key}: поле ${field}: ожидалось ${JSON.stringify(value)}, получено ${JSON.stringify(g[field])}`,
                });
            }
        }
    }
    for (const [key, g] of got) if (!want.has(key)) extra.push({ key, g });

    // A missing and an extra effect of the same kind = the model hit the wrong entity, not "forgot" one.
    for (const w of [...missing]) {
        const i = extra.findIndex(x => x.g.op === w.op);
        if (i >= 0) {
            failures.push({ cls: 'wrong_target', msg: `${w.op}: ожидалась цель ${w.taskId ?? w.projectId}, получена ${extra[i].g.taskId ?? extra[i].g.projectId}` });
            extra.splice(i, 1);
            missing.splice(missing.indexOf(w), 1);
        }
    }
    missing.forEach(w => failures.push({ cls: 'missing_action', msg: `нет действия ${w.op} ${w.taskId ?? w.projectId ?? ''}`.trim() }));
    extra.forEach(x => failures.push({ cls: 'extra_action', msg: `лишнее действие ${x.key}` }));

    if (expected.clarification && !n.reply) {
        failures.push({ cls: 'wrong_value', msg: 'ожидался уточняющий вопрос в reply, reply пуст' });
    }
    for (const s of expected.replyIncludes ?? []) {
        if (!n.reply.toLowerCase().includes(s.toLowerCase())) failures.push({ cls: 'wrong_value', msg: `в ответе нет «${s}»` });
    }
    for (const s of expected.replyExcludes ?? []) {
        if (n.reply.toLowerCase().includes(s.toLowerCase())) failures.push({ cls: 'wrong_value', msg: `в ответе не должно быть «${s}»` });
    }
    return { ok: failures.length === 0, failures };
}

/** Text fed back to the model on --retry. */
export const feedback = failures => failures.map(f => `- ${f.msg}`).join('\n');

// ---- self-test: `node scripts/ai-spike/score.mjs` -------------------------------------------------
if (process.argv[1] === fileURLToPath(import.meta.url)) {
    const { cases } = await import('./cases.mjs');
    let failed = 0;
    const check = (name, cond, detail = '') => {
        console.log(`${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : ' ' + detail}`);
        if (!cond) failed++;
    };
    const run = (plan, c) => compare(normalize(plan), c.expected);

    for (const c of cases) {
        const r = run(c.gold, c);
        check(`gold plan scores ok: ${c.id}`, r.ok, JSON.stringify(r.failures));
    }

    const c3 = cases.find(c => c.id === 'bulk-shift');
    const shifted = JSON.parse(JSON.stringify(c3.gold));
    shifted.actions[0].set.shift = '+2w';
    let r = run(shifted, c3);
    check('wrong shift → wrong_date', r.failures.some(f => f.cls === 'wrong_date'), JSON.stringify(r));

    const c6 = cases.find(c => c.id === 'delete-task');
    r = run({ reply: '', actions: [{ type: 'delete_tasks', ids: ['b0000000-0000-4000-8000-999999999999'] }] }, c6);
    check('invented id → unknown_id', r.failures.some(f => f.cls === 'unknown_id'), JSON.stringify(r));

    const c9 = cases.find(c => c.id === 'ambiguous');
    r = run({ reply: 'ок', actions: [{ type: 'delete_project', project: 'KYC' }] }, c9);
    check('action on clarification case → extra_action', r.failures.some(f => f.cls === 'extra_action'), JSON.stringify(r));

    const c5 = cases.find(c => c.id === 'rename-project');
    r = run({ reply: '', actions: [{ type: 'rename_project', project: 'KYC Legacy', name: 'KYC 2.0' }] }, c5);
    check('renaming the look-alike project → wrong_target', r.failures.some(f => f.cls === 'wrong_target'), JSON.stringify(r));

    const c4 = cases.find(c => c.id === 'bulk-status');
    r = run({ reply: '', actions: [{ type: 'update_tasks', filter: { ids: c4.gold.actions[0].filter.ids }, set: { status: 'in_progress' } }] }, c4);
    check('bad status enum → schema_violation', r.failures.some(f => f.cls === 'schema_violation'), JSON.stringify(r));

    const split = { reply: '', actions: c4.gold.actions[0].filter.ids.map(id => ({ type: 'update_tasks', filter: { ids: [id] }, set: { status: 'done' } })) };
    check('split updates score like one bulk update', run(split, c4).ok);

    check('+1m from 2026-10-31 → 2026-11-30', resolveDate('+1m', '2026-10-31') === '2026-11-30');
    check('1m duration from 2026-02-01 → 28 days', resolveDuration('1m', '2026-02-01') === 28);
    check('bad date token rejected', resolveDate('next friday') === null && resolveDate('2026-02-31') === null);
    check('invalid JSON detected', 'error' in tryParseJson('Вот план: {'));

    console.log(failed ? `\n${failed} self-test(s) FAILED` : '\nall self-tests passed');
    process.exit(failed ? 1 : 0);
}
