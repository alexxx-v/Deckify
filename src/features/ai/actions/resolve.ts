import type { DbOps, Row, TableName } from '../../../db/ops.ts';
import { TABLE_COLUMNS } from '../../../db/ops.ts';
import { getEffectiveDuration, getEffectiveStartDate } from '../../../lib/taskDates.ts';
import type { TaskDates } from '../../../lib/taskDates.ts';
import type {
    Action, DiffItem, FieldChange, Mutation, Plan, PlanIssue, Precondition, ResolvedPlan, ResolveResult, TaskFilter,
} from './types.ts';
import { markdownToHtml, resolveDate, resolveDuration } from './dates.ts';
import { MAX_MUTATIONS } from './specs.ts';
import { validatePlan } from './validate.ts';

/*
 * Turns a validated plan into explicit row mutations, a human-readable diff and the preconditions the executor
 * re-checks. Nothing is written here. Every name → id and token → date decision is made here, deterministically;
 * an unknown or ambiguous reference is an error with a Russian message (it is fed back to the model), never a guess.
 *
 * Planned vs actual (owner decision 2026-10-15):
 *  - create_task mirrors the UI "Add task" form: planned layer only, `startDate ''` / `duration 0`.
 *  - shift / start / duration mirror a roadmap drag: they write the ACTUAL layer, materialised from the effective
 *    values (actual || planned). The planned layer stays as the baseline.
 *  - status 'done' ⇒ progress 100 (as TaskEditView does).
 */

export interface ResolveContext {
    /** YYYY-MM-DD, the "today" that relative tokens resolve against. */
    today: string;
    now: number;
    newId: () => string;
}

const MAX_TASK_DAYS = 3650;

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

interface Noun {
    nom: string;          // «проект»
    gen: string;          // «проекта»
    plural: string;       // «проектов»
    notFound: string;     // «не найден» / «не найдена»
    unknownCode: string;
    ambiguousCode: string;
}
const PROJECT: Noun = { nom: 'проект', gen: 'проекта', plural: 'проектов', notFound: 'не найден', unknownCode: 'unknown_project', ambiguousCode: 'ambiguous_project' };
const BOARD: Noun = { nom: 'доска', gen: 'доски', plural: 'досок', notFound: 'не найдена', unknownCode: 'unknown_board', ambiguousCode: 'ambiguous_board' };
const TASK_TYPE: Noun = { nom: 'тип задач', gen: 'типа задач', plural: 'типов', notFound: 'не найден', unknownCode: 'unknown_task_type', ambiguousCode: 'ambiguous_task_type' };

export type RefResult = { ok: true; row: Row } | { ok: false; code: string; message: string };

/** id first, then case-insensitive exact name; an ambiguous name is an error listing the ids, never a guess. */
function resolveRef(ref: string, rows: Row[], noun: Noun, describe?: (row: Row) => string): RefResult {
    const q = ref.trim();
    const byId = rows.find(r => r.id === q);
    if (byId) return { ok: true, row: byId };
    const exact = rows.filter(r => norm(r.name) === norm(q));
    if (exact.length === 1) return { ok: true, row: exact[0] };
    if (exact.length > 1) {
        const list = exact.map(r => `${String(r.name)} [id ${String(r.id)}${describe ? `, ${describe(r)}` : ''}]`).join('; ');
        return { ok: false, code: noun.ambiguousCode, message: `название ${noun.gen} «${q}» неоднозначно (${list}); укажи id` };
    }
    const nq = norm(q);
    const similar = rows.filter(r => nq && (norm(r.name).includes(nq) || nq.includes(norm(r.name)))).slice(0, 3);
    const hint = similar.length
        ? `похожие: ${similar.map(r => `«${String(r.name)}»`).join(', ')}`
        : `доступные: ${rows.slice(0, 5).map(r => `«${String(r.name)}»`).join(', ') || `${noun.plural} нет`}`;
    return { ok: false, code: noun.unknownCode, message: `${noun.nom} «${q}» ${noun.notFound} (${hint})` };
}

export type ProjectRefResult =
    | { ok: true; project: Row }
    | { ok: false; code: 'unknown_project' | 'ambiguous_project'; message: string };

/** Shared with the read tools so reads and writes accept the same references. */
export function resolveProjectRef(ref: string, projects: Row[]): ProjectRefResult {
    const r = resolveRef(ref, projects, PROJECT);
    return r.ok ? { ok: true, project: r.row } : { ok: false, code: r.code as 'unknown_project' | 'ambiguous_project', message: r.message };
}

export const resolveBoardRef = (ref: string, boards: Row[]): RefResult => resolveRef(ref, boards, BOARD);

/** `scopeLabel` says where a type lives («общий» or a project name) so an ambiguity message is actionable. */
export const resolveTypeRef = (ref: string, types: Row[], scopeLabel?: (type: Row) => string): RefResult => resolveRef(ref, types, TASK_TYPE, scopeLabel);

const DEFAULT_TYPE_COLOR = '#4F46E5';

/** A type scoped to a project only fits that project's tasks; a global type (no projectId) fits everything. */
const scopedElsewhere = (type: Row, projectId: unknown) => type.projectId !== null && type.projectId !== undefined && String(type.projectId) !== String(projectId);

const rowKey = (table: TableName, id: unknown) => `${table}:${String(id)}`;
const sameValue = (a: unknown, b: unknown) => JSON.stringify(a ?? null) === JSON.stringify(b ?? null);

/** Working copy of the rows a plan touches: later actions see the effects of earlier ones. */
function createOverlay(ops: DbOps) {
    const originals = new Map<string, Row | null>();
    const current = new Map<string, Row | null>();
    const touched: { table: TableName; id: string }[] = [];
    const used = new Map<string, { table: TableName; id: string }>();

    const original = (table: TableName, id: string): Row | null => {
        const k = rowKey(table, id);
        if (!originals.has(k)) originals.set(k, ops.get(table, id));
        return originals.get(k) ?? null;
    };
    const get = (table: TableName, id: string): Row | null => {
        const k = rowKey(table, id);
        return current.has(k) ? (current.get(k) ?? null) : original(table, id);
    };
    const markTouched = (table: TableName, id: string) => {
        if (!touched.some(t => t.table === table && t.id === id)) touched.push({ table, id });
    };
    const matches = (row: Row, where: Row) => Object.entries(where).every(([c, v]) => sameValue(row[c], v));

    return {
        original,
        get,
        /** Rows read to make a decision (e.g. the parent project) must still be unchanged at execution time. */
        use(table: TableName, row: Row | null) {
            if (row) used.set(rowKey(table, row.id), { table, id: String(row.id) });
        },
        put(table: TableName, row: Row) {
            original(table, String(row.id));
            current.set(rowKey(table, row.id), { ...row });
            markTouched(table, String(row.id));
        },
        patch(table: TableName, id: string, patch: Row) {
            const row = get(table, id);
            if (!row) throw new Error(`overlay: ${table}:${id} does not exist`);
            this.put(table, { ...row, ...patch });
        },
        remove(table: TableName, id: string) {
            original(table, id);
            current.set(rowKey(table, id), null);
            markTouched(table, id);
        },
        select(table: TableName, where: Row = {}): Row[] {
            const ids = new Set<string>(ops.select(table, where).map(r => String(r.id)));
            for (const t of touched) if (t.table === table) ids.add(t.id);
            const rows: Row[] = [];
            for (const id of ids) {
                const row = get(table, id);
                if (row && matches(row, where)) rows.push(row);
            }
            return rows;
        },
        touched,
        used,
        current,
    };
}

type Overlay = ReturnType<typeof createOverlay>;
type Cascade = NonNullable<DiffItem['cascade']>;
type Cascades = Map<string, Cascade>;

function changedColumns(table: TableName, before: Row, after: Row): Row {
    const patch: Row = {};
    for (const col of TABLE_COLUMNS[table]) {
        if (col !== 'id' && !sameValue(before[col], after[col])) patch[col] = after[col] ?? null;
    }
    return patch;
}

export function resolvePlan(input: Plan | unknown, ops: DbOps, ctx: ResolveContext): ResolveResult {
    const validated = validatePlan(input);
    if (!validated.ok) return { ok: false, issues: validated.issues };
    const plan = validated.plan;

    const issues: PlanIssue[] = [];
    const warnings: PlanIssue[] = [];
    const overlay = createOverlay(ops);
    const cascades: Cascades = new Map();

    plan.actions.forEach((action, index) => {
        const fail = (code: string, message: string) => {
            issues.push({ severity: 'error', code, message: `Действие ${index + 1}: ${message}`, actionIndex: index });
        };
        const warn: Warn = (code, message, params) => {
            warnings.push({ severity: 'warning', code, message: `Действие ${index + 1}: ${message}`, actionIndex: index, ...(params ? { params } : {}) });
        };
        applyAction(action, overlay, ctx, fail, warn, cascades);
    });

    if (issues.length) return { ok: false, issues };

    // ---- collapse the overlay into mutations ----------------------------------------------------------
    const mutations: Mutation[] = [];
    const changedKeys = new Set<string>();
    for (const { table, id } of overlay.touched) {
        const before = overlay.original(table, id);
        const after = overlay.get(table, id);
        if (!before && !after) continue;
        if (!before && after) mutations.push({ op: 'insert', table, row: after });
        else if (before && !after) mutations.push({ op: 'delete', table, id });
        else if (before && after) {
            const patch = changedColumns(table, before, after);
            if (Object.keys(patch).length === 0) continue;
            mutations.push({ op: 'update', table, id, patch });
        }
        changedKeys.add(rowKey(table, id));
    }

    if (plan.actions.length > 0 && mutations.length === 0) {
        const why = warnings.map(w => w.message).join('; ');
        return { ok: false, issues: [{ severity: 'error', code: 'nothing_to_do', message: `План ничего не меняет в данных${why ? `: ${why}` : ''}` }] };
    }
    if (mutations.length > MAX_MUTATIONS) {
        return {
            ok: false,
            issues: [{ severity: 'error', code: 'plan_too_large', message: `План меняет ${mutations.length} записей, допустимо не больше ${MAX_MUTATIONS}. Разбейте запрос на части.` }],
        };
    }

    const preconditions: Precondition[] = [];
    const seen = new Set<string>();
    const addPrecondition = (table: TableName, id: string) => {
        const k = rowKey(table, id);
        if (seen.has(k)) return;
        seen.add(k);
        preconditions.push({ table, id, row: overlay.original(table, id) });
    };
    for (const { table, id } of overlay.touched) if (changedKeys.has(rowKey(table, id))) addPrecondition(table, id);
    for (const { table, id } of overlay.used.values()) addPrecondition(table, id);

    const diff = buildDiff(overlay, mutations, cascades);
    const affected = (table: TableName) => overlay.touched.filter(t => t.table === table && changedKeys.has(rowKey(t.table, t.id))).map(t => t.id);

    const resolved: ResolvedPlan = {
        id: ctx.newId(),
        createdAt: ctx.now,
        today: ctx.today,
        reply: plan.reply,
        diff,
        mutations,
        preconditions,
        warnings,
        affectedTaskIds: affected('tasks'),
        affectedProjectIds: affected('projects'),
    };
    return { ok: true, plan: resolved };
}


type Fail = (code: string, message: string) => void;
type Warn = (code: string, message: string, params?: Record<string, string | number>) => void;

function applyAction(
    action: Action,
    overlay: Overlay,
    ctx: ResolveContext,
    fail: Fail,
    warn: Warn,
    cascades: Cascades,
): void {
    const projectByRef = (ref: string): Row | null => {
        const result = resolveProjectRef(ref, overlay.select('projects'));
        if (!result.ok) {
            fail(result.code, result.message);
            return null;
        }
        overlay.use('projects', result.project);
        return result.project;
    };
    const boardByRef = (ref: string): Row | null => {
        const result = resolveBoardRef(ref, overlay.select('boards'));
        if (!result.ok) {
            fail(result.code, result.message);
            return null;
        }
        overlay.use('boards', result.row);
        return result.row;
    };
    const scopeLabel = (type: Row): string => {
        if (type.projectId === null || type.projectId === undefined) return 'общий';
        return `проект «${String(overlay.get('projects', String(type.projectId))?.name ?? '')}»`;
    };
    /** Types a task of one of `projectIds` can have: global ones and the ones scoped to its project. */
    const visibleTypes = (projectIds: Set<string>) =>
        overlay.select('task_types').filter(t => t.projectId === null || t.projectId === undefined || projectIds.has(String(t.projectId)));
    const typeByRef = (ref: string, candidates: Row[]): Row | null => {
        // An id always finds its type (the scope rules are checked afterwards); names only see `candidates`.
        const byId = overlay.select('task_types').find(t => t.id === ref.trim());
        const result: RefResult = byId ? { ok: true, row: byId } : resolveTypeRef(ref, candidates, scopeLabel);
        if (!result.ok) {
            fail(result.code, result.message);
            return null;
        }
        overlay.use('task_types', result.row);
        return result.row;
    };
    const taskLabel = (t: Row) => `«${String(t.title)}»`;

    /** Tasks picked by `filter` (project / status / ids). Same rules for every action that takes a filter. */
    const selectTasks = (filter: TaskFilter): Row[] | null => {
        const project = filter.project !== undefined ? projectByRef(filter.project) : null;
        if (filter.project !== undefined && !project) return null;

        let rows: Row[];
        if (filter.ids) {
            const missing = filter.ids.filter(id => !overlay.get('tasks', id));
            if (missing.length) {
                fail('unknown_task', `задачи с id ${missing.map(m => `«${m}»`).join(', ')} не найдены (возможно, удалены ранее в этом плане); бери id только из контекста`);
                return null;
            }
            rows = [...new Set(filter.ids)].map(id => overlay.get('tasks', id) as Row);
        } else if (project) {
            rows = overlay.select('tasks', { projectId: project.id });
        } else {
            rows = overlay.select('tasks');
        }
        if (project) rows = rows.filter(t => t.projectId === project.id);
        if (filter.status) rows = rows.filter(t => t.status === filter.status);
        if (rows.length === 0) {
            fail('no_match', 'фильтру не соответствует ни одна задача');
            return null;
        }
        return rows;
    };

    switch (action.type) {
        case 'create_task': {
            const project = projectByRef(action.project);
            const start = resolveDate(action.start, ctx.today);
            if (!start) fail('bad_token', `дата start «${action.start}» вне допустимого диапазона`);
            const days = start ? resolveDuration(action.duration, start) : null;
            if (start && (days === null || days < 1 || days > MAX_TASK_DAYS)) {
                fail('bad_token', `duration «${action.duration}» должна быть от 1 до ${MAX_TASK_DAYS} дней`);
            }
            let taskTypeId: string | null = null;
            if (project && action.taskType !== undefined && norm(action.taskType) !== 'none') {
                const type = typeByRef(action.taskType, visibleTypes(new Set([String(project.id)])));
                if (!type) return;
                if (scopedElsewhere(type, project.id)) {
                    fail('type_scope', `тип «${String(type.name)}» относится только к ${scopeLabel(type)}, а задача создаётся в проекте «${String(project.name)}»`);
                    return;
                }
                taskTypeId = String(type.id);
            }
            if (!project || !start || days === null || days < 1 || days > MAX_TASK_DAYS) return;
            const status = action.status ?? 'backlog';
            overlay.put('tasks', {
                id: ctx.newId(),
                projectId: project.id,
                title: action.title.trim(),
                description: action.description ? markdownToHtml(action.description) : '',
                startDate: '',
                duration: 0,
                plannedStartDate: start,
                plannedDuration: days,
                progress: status === 'done' ? 100 : 0,
                status,
                steps: JSON.stringify((action.steps ?? []).map(text => ({ id: ctx.newId(), text: text.trim(), completed: false }))),
                taskTypeId,
            });
            return;
        }

        case 'update_tasks': {
            const { filter, set } = action;
            const rows = selectTasks(filter);
            if (!rows) return;

            for (const task of rows) {
                const dates = task as unknown as TaskDates;
                const effStart = getEffectiveStartDate(dates);
                const effDuration = getEffectiveDuration(dates);
                const patch: Row = {};

                const needsDates = set.shift !== undefined || set.start !== undefined || set.duration !== undefined;
                if (needsDates && !effStart) {
                    fail('bad_state', `у задачи ${taskLabel(task)} нет даты начала, сдвинуть её нельзя`);
                    continue;
                }
                if (set.shift !== undefined) {
                    const next = resolveDate(set.shift, effStart);
                    if (!next) { fail('bad_token', `сдвиг «${set.shift}» для задачи ${taskLabel(task)} выходит за допустимый диапазон дат`); continue; }
                    patch.startDate = next;
                    patch.duration = effDuration;
                }
                if (set.start !== undefined) {
                    const next = resolveDate(set.start, ctx.today);
                    if (!next) { fail('bad_token', `дата «${set.start}» вне допустимого диапазона`); continue; }
                    patch.startDate = next;
                    patch.duration = effDuration;
                }
                if (set.duration !== undefined) {
                    const base = (patch.startDate as string | undefined) ?? effStart;
                    const days = resolveDuration(set.duration, base);
                    if (days === null || days < 1 || days > MAX_TASK_DAYS) {
                        fail('bad_token', `длительность «${set.duration}» должна быть от 1 до ${MAX_TASK_DAYS} дней`);
                        continue;
                    }
                    patch.duration = days;
                    if (patch.startDate === undefined) patch.startDate = effStart;
                }
                if (set.status !== undefined) {
                    patch.status = set.status;
                    if (set.status === 'done') patch.progress = 100;
                }
                if (set.progress !== undefined && patch.progress === undefined) patch.progress = set.progress;
                if (set.title !== undefined) patch.title = set.title.trim();
                if (set.description !== undefined) patch.description = markdownToHtml(set.description);
                overlay.patch('tasks', String(task.id), patch);
            }
            return;
        }

        case 'delete_tasks': {
            const ids = [...new Set(action.ids)];
            const missing = ids.filter(id => !overlay.get('tasks', id));
            if (missing.length) {
                fail('unknown_task', `задачи с id ${missing.map(m => `«${m}»`).join(', ')} не найдены (возможно, удалены ранее в этом плане); бери id только из контекста`);
                return;
            }
            for (const id of ids) {
                for (const link of overlay.select('board_tasks', { taskId: id })) overlay.remove('board_tasks', String(link.id));
                overlay.remove('tasks', id);
            }
            return;
        }

        case 'create_project': {
            const name = action.name.trim();
            if (overlay.select('projects').some(p => norm(p.name) === norm(name))) {
                warn('duplicate_project_name', `проект с названием «${name}» уже есть; будет создан второй`, { name });
            }
            overlay.put('projects', { id: ctx.newId(), name, createdAt: ctx.now });
            return;
        }

        case 'rename_project': {
            const project = projectByRef(action.project);
            if (!project) return;
            const name = action.name.trim();
            if (String(project.name) === name) {
                warn('no_change', `проект уже называется «${name}»`, { name });
                return;
            }
            overlay.patch('projects', String(project.id), { name });
            return;
        }

        case 'delete_project': {
            const project = projectByRef(action.project);
            if (!project) return;
            const id = String(project.id);
            // Same rows the db.projects.delete cascade removes (src/db/schema.ts): board links of its tasks,
            // its tasks, its scoped task types, the project.
            const tasks = overlay.select('tasks', { projectId: id });
            let boardLinks = 0;
            for (const task of tasks) {
                for (const link of overlay.select('board_tasks', { taskId: task.id })) {
                    overlay.remove('board_tasks', String(link.id));
                    boardLinks++;
                }
                overlay.remove('tasks', String(task.id));
            }
            const types = overlay.select('task_types', { projectId: id });
            for (const type of types) overlay.remove('task_types', String(type.id));
            overlay.remove('projects', id);
            cascades.set(id, { tasks: tasks.length, boardLinks, taskTypes: types.length });
            return;
        }

        case 'create_board': {
            const name = action.name.trim();
            if (overlay.select('boards').some(b => norm(b.name) === norm(name))) {
                warn('duplicate_board_name', `доска с названием «${name}» уже есть; будет создана вторая`, { name });
            }
            overlay.put('boards', { id: ctx.newId(), name, createdAt: ctx.now });
            return;
        }

        case 'rename_board': {
            const board = boardByRef(action.board);
            if (!board) return;
            const name = action.name.trim();
            if (String(board.name) === name) {
                warn('no_change', `доска уже называется «${name}»`, { name });
                return;
            }
            overlay.patch('boards', String(board.id), { name });
            return;
        }

        case 'delete_board': {
            const board = boardByRef(action.board);
            if (!board) return;
            // db.boards.delete: the board's links go with it, the tasks stay.
            const links = overlay.select('board_tasks', { boardId: board.id });
            for (const link of links) overlay.remove('board_tasks', String(link.id));
            overlay.remove('boards', String(board.id));
            cascades.set(String(board.id), { boardLinks: links.length });
            return;
        }

        case 'add_to_board': {
            const board = boardByRef(action.board);
            const rows = selectTasks(action.filter);
            if (!board || !rows) return;
            const linked = new Set(overlay.select('board_tasks', { boardId: board.id }).map(l => String(l.taskId)));
            const fresh = rows.filter(t => !linked.has(String(t.id)));
            if (fresh.length === 0) {
                warn('already_on_board_all', `все выбранные задачи (${rows.length}) уже есть в доске «${String(board.name)}»`, { count: rows.length, board: String(board.name) });
                return;
            }
            if (fresh.length < rows.length) {
                warn('already_on_board', `${rows.length - fresh.length} из ${rows.length} задач уже в доске «${String(board.name)}»; они пропущены`, { count: rows.length - fresh.length, total: rows.length, board: String(board.name) });
            }
            for (const task of fresh) {
                overlay.use('tasks', task); // a task deleted before confirmation must not leave a dangling link
                overlay.put('board_tasks', { id: ctx.newId(), boardId: board.id, taskId: task.id, addedAt: ctx.now });
            }
            return;
        }

        case 'remove_from_board': {
            const board = boardByRef(action.board);
            const rows = selectTasks(action.filter);
            if (!board || !rows) return;
            let removed = 0;
            for (const task of rows) {
                for (const link of overlay.select('board_tasks', { boardId: board.id, taskId: task.id })) {
                    overlay.remove('board_tasks', String(link.id));
                    removed++;
                }
            }
            if (removed === 0) {
                warn('not_on_board_all', `выбранных задач нет в доске «${String(board.name)}»`, { board: String(board.name) });
                return;
            }
            if (removed < rows.length) warn('not_on_board', `${rows.length - removed} из ${rows.length} задач и так не были в доске «${String(board.name)}»`, { count: rows.length - removed, total: rows.length, board: String(board.name) });
            return;
        }

        case 'create_task_type': {
            const name = action.name.trim();
            const project = action.project !== undefined ? projectByRef(action.project) : null;
            if (action.project !== undefined && !project) return;
            const scope = project ? String(project.id) : null;
            if (overlay.select('task_types').some(t => norm(t.name) === norm(name) && (t.projectId ?? null) === scope)) {
                warn('duplicate_task_type_name', `тип задач «${name}» уже есть в этой области; будет создан второй`, { name });
            }
            overlay.put('task_types', { id: ctx.newId(), projectId: scope, name, color: action.color ?? DEFAULT_TYPE_COLOR });
            return;
        }

        case 'update_task_type': {
            const type = typeByRef(action.taskType, overlay.select('task_types'));
            if (!type) return;
            const patch: Row = {};
            if (action.name !== undefined && action.name.trim() !== String(type.name)) patch.name = action.name.trim();
            if (action.color !== undefined && action.color.toLowerCase() !== String(type.color).toLowerCase()) patch.color = action.color;
            const alreadyGlobal = type.projectId === null || type.projectId === undefined;
            if (action.global && !alreadyGlobal) patch.projectId = null;
            if (Object.keys(patch).length === 0) {
                // One warning: «уже общий» when that was the only thing asked, otherwise «уже такой».
                const only = action.global && alreadyGlobal && action.name === undefined && action.color === undefined;
                warn('no_change', `тип «${String(type.name)}» ${only ? 'уже общий' : 'уже такой'}`, { name: String(type.name) });
                return;
            }
            overlay.patch('task_types', String(type.id), patch);
            return;
        }

        case 'delete_task_type': {
            const type = typeByRef(action.taskType, overlay.select('task_types'));
            if (!type) return;
            // db.taskTypes.delete: tasks that used the type lose it (they are updated, not deleted).
            const users = overlay.select('tasks', { taskTypeId: type.id });
            for (const task of users) overlay.patch('tasks', String(task.id), { taskTypeId: null });
            overlay.remove('task_types', String(type.id));
            cascades.set(String(type.id), { unassignedTasks: users.length });
            return;
        }

        case 'set_task_type': {
            const rows = selectTasks(action.filter);
            if (!rows) return;
            let typeId: string | null = null;
            if (norm(action.taskType) !== 'none') {
                const type = typeByRef(action.taskType, visibleTypes(new Set(rows.map(t => String(t.projectId)))));
                if (!type) return;
                const foreign = rows.find(t => scopedElsewhere(type, t.projectId));
                if (foreign) {
                    fail('type_scope', `тип «${String(type.name)}» относится только к ${scopeLabel(type)}, а задача ${taskLabel(foreign)} из другого проекта`);
                    return;
                }
                typeId = String(type.id);
            }
            for (const task of rows) {
                if ((task.taskTypeId ?? null) !== typeId) overlay.patch('tasks', String(task.id), { taskTypeId: typeId });
            }
            return;
        }
    }
}

const TASK_CREATE_FIELDS = ['status', 'plannedStartDate', 'plannedDuration', 'progress', 'description'];

/**
 * One DiffItem per user-visible entity. Changes the user did not ask for as such are folded into their cause:
 * tasks removed with a project, board links removed with a board or a task, scoped types removed with a project,
 * and tasks that merely lost a deleted type are summarised on the parent item (`cascade`), not listed one by one.
 * Board links appear as a `board` change on the task they belong to.
 */
function buildDiff(overlay: Overlay, mutations: Mutation[], cascades: Cascades): DiffItem[] {
    const orig = (table: TableName, id: unknown) => overlay.original(table, String(id));
    const latest = (table: TableName, id: unknown) => overlay.get(table, String(id)) ?? orig(table, id);
    const nameOf = (table: TableName, id: unknown): string | null => {
        if (id === null || id === undefined) return null;
        const row = latest(table, id);
        return row ? String(row.name) : null;
    };
    const ids = (table: TableName) => new Set(mutations.flatMap(m => (m.table === table && m.op === 'delete' ? [m.id] : [])));
    const deletedProjects = ids('projects');
    const deletedBoards = ids('boards');
    const deletedTasks = ids('tasks');
    const deletedTypes = ids('task_types');

    const items = new Map<string, DiffItem>();
    const taskItem = (id: string, op: DiffItem['op']): DiffItem => {
        let item = items.get(`task:${id}`);
        if (!item) {
            const row = latest('tasks', id) as Row;
            item = { entity: 'task', op, id, label: String(row.title), projectId: String(row.projectId), projectName: nameOf('projects', row.projectId) ?? undefined, changes: [] };
            items.set(`task:${id}`, item);
        }
        return item;
    };
    const typeChange = (from: unknown, to: unknown): FieldChange => ({ field: 'taskType', from: nameOf('task_types', from), to: nameOf('task_types', to) });

    for (const m of mutations) {
        switch (m.table) {
            case 'tasks': {
                if (m.op === 'insert') {
                    const item = taskItem(String(m.row.id), 'create');
                    item.op = 'create'; // a board link may have been seen first
                    for (const field of TASK_CREATE_FIELDS) item.changes.push({ field, from: null, to: m.row[field] });
                    let steps: unknown[] = [];
                    try { steps = JSON.parse(String(m.row.steps ?? '[]')) as unknown[]; } catch { steps = []; }
                    if (steps.length) item.changes.push({ field: 'steps', from: null, to: steps.map(s => (s as { text: string }).text) });
                    if (m.row.taskTypeId) item.changes.push(typeChange(null, m.row.taskTypeId));
                } else if (m.op === 'update') {
                    const before = orig('tasks', m.id) as Row;
                    const keys = Object.keys(m.patch);
                    const onlyLostDeletedType = keys.length === 1 && keys[0] === 'taskTypeId' && m.patch.taskTypeId === null && deletedTypes.has(String(before.taskTypeId));
                    if (onlyLostDeletedType) break;
                    const item = taskItem(m.id, 'update');
                    for (const field of keys) {
                        item.changes.push(field === 'taskTypeId' ? typeChange(before.taskTypeId, m.patch.taskTypeId) : { field, from: before[field] ?? null, to: m.patch[field] });
                    }
                } else {
                    const before = orig('tasks', m.id) as Row;
                    if (deletedProjects.has(String(before.projectId))) break; // summarised on the project
                    const item = taskItem(m.id, 'delete');
                    item.op = 'delete';
                    item.changes = [];
                }
                break;
            }
            case 'board_tasks': {
                if (m.op === 'insert') {
                    const item = taskItem(String(m.row.taskId), 'update');
                    item.changes.push({ field: 'board', from: null, to: nameOf('boards', m.row.boardId) });
                } else if (m.op === 'delete') {
                    const before = orig('board_tasks', m.id) as Row;
                    if (deletedBoards.has(String(before.boardId)) || deletedTasks.has(String(before.taskId))) break; // cascade
                    const item = taskItem(String(before.taskId), 'update');
                    item.changes.push({ field: 'board', from: nameOf('boards', before.boardId), to: null });
                }
                break;
            }
            case 'projects':
            case 'boards': {
                const entity = m.table === 'projects' ? 'project' : 'board';
                const put = (item: Omit<DiffItem, 'entity' | 'id'>, id: string) => items.set(`${entity}:${id}`, { entity, id, ...item });
                if (m.op === 'insert') {
                    put({ op: 'create', label: String(m.row.name), changes: [{ field: 'name', from: null, to: m.row.name }] }, String(m.row.id));
                } else if (m.op === 'update') {
                    const before = orig(m.table, m.id) as Row;
                    put({ op: 'update', label: String(m.patch.name ?? before.name), changes: Object.keys(m.patch).map(field => ({ field, from: before[field] ?? null, to: m.patch[field] })) }, m.id);
                } else {
                    const before = orig(m.table, m.id) as Row;
                    put({ op: 'delete', label: String(before.name), changes: [], cascade: cascades.get(m.id) }, m.id);
                }
                break;
            }
            case 'task_types': {
                const scope = (projectId: unknown): string | null => nameOf('projects', projectId);
                if (m.op === 'insert') {
                    items.set(`task_type:${m.row.id}`, {
                        entity: 'task_type', op: 'create', id: String(m.row.id), label: String(m.row.name),
                        changes: [{ field: 'color', from: null, to: m.row.color }, { field: 'scope', from: null, to: scope(m.row.projectId) }],
                    });
                } else if (m.op === 'update') {
                    const before = orig('task_types', m.id) as Row;
                    const changes: FieldChange[] = Object.keys(m.patch).map(field => (field === 'projectId'
                        ? { field: 'scope', from: scope(before.projectId), to: scope(m.patch.projectId) }
                        : { field, from: before[field] ?? null, to: m.patch[field] }));
                    items.set(`task_type:${m.id}`, { entity: 'task_type', op: 'update', id: m.id, label: String(m.patch.name ?? before.name), changes });
                } else {
                    const before = orig('task_types', m.id) as Row;
                    if (deletedProjects.has(String(before.projectId))) break; // summarised on the project
                    items.set(`task_type:${m.id}`, { entity: 'task_type', op: 'delete', id: m.id, label: String(before.name), changes: [], cascade: cascades.get(m.id) });
                }
                break;
            }
        }
    }
    return [...items.values()];
}
