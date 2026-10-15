import type { Action, Plan, PlanIssue, TaskFilter, TaskSet, TaskStatusValue, ValidateResult } from './types.ts';
import { DATE_TOKEN_RE, DURATION_TOKEN_RE, SHIFT_TOKEN_RE, resolveDate } from './dates.ts';
import { ACTION_SPECS, LIMITS, MAX_ACTIONS, STATUSES } from './specs.ts';

/*
 * Schema-level validation of a model plan. Nothing is coerced or repaired: a numeric `duration` is a
 * `bad_token`, not a silently converted "7d". The only leniency is dropping null / '' fields (constrained
 * decoding fills every unused property of a flat schema) and ignoring keys an action does not use.
 * Messages are Russian because they go back to the model on retry; `code` is stable for the UI.
 */

const SET_KEYS = ['shift', 'start', 'duration', 'status', 'title', 'description', 'progress'];
const FILTER_KEYS = ['project', 'status', 'ids'];
// Relative tokens are range-checked again against the real "today" in resolve.ts.
const SANITY_BASE = '2026-01-01';
const COLOR_RE = /^#[0-9a-fA-F]{6}$/;

type Obj = Record<string, unknown>;
const isObj = (v: unknown): v is Obj => typeof v === 'object' && v !== null && !Array.isArray(v);
const isStr = (v: unknown): v is string => typeof v === 'string' && v.trim() !== '';
const isStatus = (v: unknown): v is TaskStatusValue => typeof v === 'string' && (STATUSES as readonly string[]).includes(v);

function clean(obj: Obj): Obj {
    const out: Obj = {};
    for (const [k, v] of Object.entries(obj)) {
        if (v === null || v === undefined || v === '') continue;
        out[k] = k === 'filter' || k === 'set' ? (isObj(v) ? clean(v) : v) : v;
    }
    return out;
}

const dateOk = (v: unknown) => typeof v === 'string' && DATE_TOKEN_RE.test(v) && resolveDate(v, SANITY_BASE) !== null;
const durationOk = (v: unknown) => typeof v === 'string' && DURATION_TOKEN_RE.test(v) && Number(v.slice(0, -1)) > 0;

function validateAction(rawAction: unknown, index: number, issues: PlanIssue[]): Action | null {
    const n = index + 1;
    const where = `Действие ${n}`;
    const before = issues.length;
    const err = (code: string, message: string) => { issues.push({ severity: 'error', code, message: `${where}: ${message}`, actionIndex: index }); };

    if (!isObj(rawAction)) {
        err('bad_type', 'действие должно быть объектом');
        return null;
    }
    const a = clean(rawAction);
    const type = a.type;

    const needStr = (field: string, max: number): string => {
        const v = a[field];
        if (!isStr(v)) { err('missing_field', `${type}: нужно непустое поле ${field}`); return ''; }
        if (v.length > max) err('too_long', `${type}: ${field} длиннее ${max} символов`);
        return v;
    };
    const idList = (value: unknown, field: string): string[] => {
        if (!Array.isArray(value) || value.length === 0 || !value.every(isStr)) {
            err('bad_type', `${type}: ${field} должен быть непустым массивом строк (id из контекста)`);
            return [];
        }
        if (value.length > LIMITS.ids) err('too_many', `${type}: в ${field} не больше ${LIMITS.ids} id`);
        return value as string[];
    };
    /** The `filter` object shared by update_tasks, add_to_board, remove_from_board and set_task_type. */
    const readFilter = (f: unknown): TaskFilter => {
        const filter: TaskFilter = {};
        if (!isObj(f) || Object.keys(f).length === 0) {
            err('empty_filter', `${type}: нужен непустой filter (project, status или ids)`);
            return filter;
        }
        const bad = Object.keys(f).filter(k => !FILTER_KEYS.includes(k));
        if (bad.length) err('unknown_field', `${type}: неизвестные поля filter: ${bad.join(', ')}`);
        if (f.project !== undefined) { if (isStr(f.project)) filter.project = f.project; else err('bad_type', `${type}: filter.project должен быть строкой`); }
        if (f.status !== undefined) { if (isStatus(f.status)) filter.status = f.status; else err('bad_enum', `${type}: filter.status некорректен «${String(f.status)}»`); }
        if (f.ids !== undefined) filter.ids = idList(f.ids, 'filter.ids');
        return filter;
    };

    switch (type) {
        case 'create_task': {
            const project = needStr('project', LIMITS.projectName * 2);
            const title = needStr('title', LIMITS.title);
            const start = a.start;
            const duration = a.duration;
            if (!dateOk(start)) err('bad_token', `create_task: start должен быть today, ±Nd/±Nw/±Nm или YYYY-MM-DD, получено «${String(start)}»`);
            if (!durationOk(duration)) err('bad_token', `create_task: duration должен быть Nd, Nw или Nm (N > 0), получено «${String(duration)}»`);
            let description: string | undefined;
            if (a.description !== undefined) {
                if (typeof a.description !== 'string') err('bad_type', 'create_task: description должен быть строкой');
                else if (a.description.length > LIMITS.description) err('too_long', `create_task: description длиннее ${LIMITS.description} символов`);
                else description = a.description;
            }
            let steps: string[] | undefined;
            if (a.steps !== undefined) {
                if (!Array.isArray(a.steps) || !a.steps.every(isStr)) err('bad_type', 'create_task: steps должен быть массивом непустых строк');
                else if (a.steps.length > LIMITS.steps) err('too_many', `create_task: не больше ${LIMITS.steps} шагов`);
                else if (a.steps.some(s => (s as string).length > LIMITS.step)) err('too_long', `create_task: шаг длиннее ${LIMITS.step} символов`);
                else steps = a.steps as string[];
            }
            if (a.status !== undefined && !isStatus(a.status)) err('bad_enum', `create_task: status должен быть одним из ${STATUSES.join('/')}, получено «${String(a.status)}»`);
            let taskType: string | undefined;
            if (a.taskType !== undefined) { if (isStr(a.taskType)) taskType = a.taskType; else err('bad_type', 'create_task: taskType должен быть строкой'); }
            if (issues.length > before) return null;
            return { type, project, title, start: start as string, duration: duration as string, description, steps, status: a.status as TaskStatusValue | undefined, taskType };
        }
        case 'update_tasks': {
            const set: TaskSet = {};
            const s = a.set;
            const filter = readFilter(a.filter);
            if (!isObj(s) || Object.keys(s).length === 0) err('empty_set', 'update_tasks: нужен непустой set');
            else {
                const bad = Object.keys(s).filter(k => !SET_KEYS.includes(k));
                if (bad.length) err('unknown_field', `update_tasks: неизвестные поля set: ${bad.join(', ')}`);
                if (s.shift !== undefined) { if (typeof s.shift === 'string' && SHIFT_TOKEN_RE.test(s.shift)) set.shift = s.shift; else err('bad_token', `update_tasks: set.shift должен быть ±Nd/±Nw/±Nm, получено «${String(s.shift)}»`); }
                if (s.start !== undefined) { if (dateOk(s.start)) set.start = s.start as string; else err('bad_token', `update_tasks: set.start некорректен «${String(s.start)}»`); }
                if (s.duration !== undefined) { if (durationOk(s.duration)) set.duration = s.duration as string; else err('bad_token', `update_tasks: set.duration некорректен «${String(s.duration)}»`); }
                if (s.status !== undefined) { if (isStatus(s.status)) set.status = s.status; else err('bad_enum', `update_tasks: set.status некорректен «${String(s.status)}»`); }
                if (s.title !== undefined) {
                    if (!isStr(s.title)) err('bad_type', 'update_tasks: set.title должен быть строкой');
                    else if (s.title.length > LIMITS.title) err('too_long', `update_tasks: set.title длиннее ${LIMITS.title} символов`);
                    else set.title = s.title;
                }
                if (s.description !== undefined) {
                    if (typeof s.description !== 'string') err('bad_type', 'update_tasks: set.description должен быть строкой');
                    else if (s.description.length > LIMITS.description) err('too_long', `update_tasks: set.description длиннее ${LIMITS.description} символов`);
                    else set.description = s.description;
                }
                if (s.progress !== undefined) {
                    if (typeof s.progress === 'number' && Number.isInteger(s.progress) && s.progress >= 0 && s.progress <= 100) set.progress = s.progress;
                    else err('bad_type', `update_tasks: set.progress должен быть целым числом 0–100, получено «${String(s.progress)}»`);
                }
                if (s.shift !== undefined && s.start !== undefined) err('conflict_fields', 'update_tasks: shift и start взаимоисключающие');
            }
            if (issues.length > before) return null;
            return { type, filter, set };
        }
        case 'delete_tasks': {
            const ids = idList(a.ids, 'ids');
            if (issues.length > before) return null;
            return { type, ids };
        }
        case 'create_project': {
            const name = needStr('name', LIMITS.projectName);
            if (issues.length > before) return null;
            return { type, name };
        }
        case 'rename_project': {
            const project = needStr('project', LIMITS.projectName * 2);
            const name = needStr('name', LIMITS.projectName);
            if (issues.length > before) return null;
            return { type, project, name };
        }
        case 'delete_project': {
            const project = needStr('project', LIMITS.projectName * 2);
            if (issues.length > before) return null;
            return { type, project };
        }
        case 'create_board': {
            const name = needStr('name', LIMITS.projectName);
            if (issues.length > before) return null;
            return { type, name };
        }
        case 'rename_board': {
            const board = needStr('board', LIMITS.projectName * 2);
            const name = needStr('name', LIMITS.projectName);
            if (issues.length > before) return null;
            return { type, board, name };
        }
        case 'delete_board': {
            const board = needStr('board', LIMITS.projectName * 2);
            if (issues.length > before) return null;
            return { type, board };
        }
        case 'add_to_board':
        case 'remove_from_board': {
            const board = needStr('board', LIMITS.projectName * 2);
            const filter = readFilter(a.filter);
            if (issues.length > before) return null;
            return { type, board, filter };
        }
        case 'create_task_type': {
            const name = needStr('name', LIMITS.projectName);
            let color: string | undefined;
            if (a.color !== undefined) { if (typeof a.color === 'string' && COLOR_RE.test(a.color)) color = a.color; else err('bad_token', `create_task_type: color должен быть в формате #RRGGBB, получено «${String(a.color)}»`); }
            let project: string | undefined;
            if (a.project !== undefined) { if (isStr(a.project)) project = a.project; else err('bad_type', 'create_task_type: project должен быть строкой'); }
            if (issues.length > before) return null;
            return { type, name, color, project };
        }
        case 'update_task_type': {
            const taskType = needStr('taskType', LIMITS.projectName * 2);
            let name: string | undefined;
            if (a.name !== undefined) { if (isStr(a.name) && a.name.length <= LIMITS.projectName) name = a.name; else err('bad_type', `update_task_type: name должен быть строкой до ${LIMITS.projectName} символов`); }
            let color: string | undefined;
            if (a.color !== undefined) { if (typeof a.color === 'string' && COLOR_RE.test(a.color)) color = a.color; else err('bad_token', `update_task_type: color должен быть в формате #RRGGBB, получено «${String(a.color)}»`); }
            // `global: false` is what constrained decoding writes for an unused boolean; it means "not set".
            let global: boolean | undefined;
            if (a.global !== undefined && a.global !== false) { if (a.global === true) global = true; else err('bad_type', 'update_task_type: global может быть только true'); }
            if (issues.length === before && name === undefined && color === undefined && global === undefined) err('empty_set', 'update_task_type: укажи хотя бы одно из name, color, global');
            if (issues.length > before) return null;
            return { type, taskType, name, color, global };
        }
        case 'delete_task_type': {
            const taskType = needStr('taskType', LIMITS.projectName * 2);
            if (issues.length > before) return null;
            return { type, taskType };
        }
        case 'set_task_type': {
            const taskType = needStr('taskType', LIMITS.projectName * 2);
            const filter = readFilter(a.filter);
            if (issues.length > before) return null;
            return { type, filter, taskType };
        }
        default:
            err('unknown_type', `неизвестный тип действия «${String(type)}»; допустимы ${ACTION_SPECS.map(x => x.type).join(', ')}`);
            return null;
    }
}

export function validatePlan(input: unknown): ValidateResult {
    const issues: PlanIssue[] = [];
    if (!isObj(input)) {
        return { ok: false, issues: [{ severity: 'error', code: 'bad_plan', message: 'План должен быть объектом { reply, actions }' }] };
    }
    if (!Array.isArray(input.actions)) {
        return { ok: false, issues: [{ severity: 'error', code: 'bad_plan', message: 'План должен содержать массив actions (пустой, если действий нет)' }] };
    }
    if (input.reply !== undefined && input.reply !== null && typeof input.reply !== 'string') {
        issues.push({ severity: 'error', code: 'bad_type', message: 'reply должен быть строкой' });
    }
    if (input.actions.length > MAX_ACTIONS) {
        issues.push({ severity: 'error', code: 'too_many', message: `В плане не больше ${MAX_ACTIONS} действий, получено ${input.actions.length}. Разбейте запрос.` });
        return { ok: false, issues };
    }
    const actions: Action[] = [];
    input.actions.forEach((raw, i) => {
        const action = validateAction(raw, i, issues);
        if (action) actions.push(action);
    });
    if (issues.length) return { ok: false, issues };
    const plan: Plan = { reply: typeof input.reply === 'string' ? input.reply : '', actions };
    return { ok: true, plan };
}
