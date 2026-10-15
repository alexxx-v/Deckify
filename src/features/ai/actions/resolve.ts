import type { DbOps, Row, TableName } from '../../../db/ops.ts';
import { TABLE_COLUMNS } from '../../../db/ops.ts';
import { getEffectiveDuration, getEffectiveStartDate } from '../../../lib/taskDates.ts';
import type { TaskDates } from '../../../lib/taskDates.ts';
import type {
    Action, DiffItem, FieldChange, Mutation, Plan, PlanIssue, Precondition, ResolvedPlan, ResolveResult,
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

export type ProjectRefResult =
    | { ok: true; project: Row }
    | { ok: false; code: 'unknown_project' | 'ambiguous_project'; message: string };

const norm = (s: unknown) => String(s ?? '').trim().toLowerCase().replace(/\s+/g, ' ');

/** id first, then case-insensitive exact name. Shared with the read tools so both accept the same references. */
export function resolveProjectRef(ref: string, projects: Row[]): ProjectRefResult {
    const q = ref.trim();
    const byId = projects.find(p => p.id === q);
    if (byId) return { ok: true, project: byId };
    const exact = projects.filter(p => norm(p.name) === norm(q));
    if (exact.length === 1) return { ok: true, project: exact[0] };
    if (exact.length > 1) {
        return {
            ok: false,
            code: 'ambiguous_project',
            message: `название проекта «${q}» неоднозначно (${exact.map(p => `${String(p.name)} [id ${String(p.id)}]`).join('; ')}); укажи id`,
        };
    }
    const nq = norm(q);
    const similar = projects.filter(p => nq && (norm(p.name).includes(nq) || nq.includes(norm(p.name)))).slice(0, 3);
    const hint = similar.length
        ? `похожие: ${similar.map(p => `«${String(p.name)}»`).join(', ')}`
        : `доступные: ${projects.slice(0, 5).map(p => `«${String(p.name)}»`).join(', ') || 'проектов нет'}`;
    return { ok: false, code: 'unknown_project', message: `проект «${q}» не найден (${hint})` };
}

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
    const cascades = new Map<string, { tasks: number; boardLinks: number; taskTypes: number }>();

    plan.actions.forEach((action, index) => {
        const fail = (code: string, message: string) => {
            issues.push({ severity: 'error', code, message: `Действие ${index + 1}: ${message}`, actionIndex: index });
        };
        const warn = (code: string, message: string) => {
            warnings.push({ severity: 'warning', code, message: `Действие ${index + 1}: ${message}`, actionIndex: index });
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
        return { ok: false, issues: [{ severity: 'error', code: 'nothing_to_do', message: 'План ничего не меняет в данных' }] };
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

function applyAction(
    action: Action,
    overlay: Overlay,
    ctx: ResolveContext,
    fail: Fail,
    warn: Fail,
    cascades: Map<string, { tasks: number; boardLinks: number; taskTypes: number }>,
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
    const taskLabel = (t: Row) => `«${String(t.title)}»`;

    switch (action.type) {
        case 'create_task': {
            const project = projectByRef(action.project);
            const start = resolveDate(action.start, ctx.today);
            if (!start) fail('bad_token', `дата start «${action.start}» вне допустимого диапазона`);
            const days = start ? resolveDuration(action.duration, start) : null;
            if (start && (days === null || days < 1 || days > MAX_TASK_DAYS)) {
                fail('bad_token', `duration «${action.duration}» должна быть от 1 до ${MAX_TASK_DAYS} дней`);
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
                taskTypeId: null,
            });
            return;
        }

        case 'update_tasks': {
            const { filter, set } = action;
            const project = filter.project !== undefined ? projectByRef(filter.project) : null;
            if (filter.project !== undefined && !project) return;

            let rows: Row[];
            if (filter.ids) {
                const missing = filter.ids.filter(id => !overlay.get('tasks', id));
                if (missing.length) {
                    fail('unknown_task', `задачи с id ${missing.map(m => `«${m}»`).join(', ')} не найдены (возможно, удалены ранее в этом плане); бери id только из контекста`);
                    return;
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
                return;
            }

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
                warn('duplicate_project_name', `проект с названием «${name}» уже есть; будет создан второй`);
            }
            overlay.put('projects', { id: ctx.newId(), name, createdAt: ctx.now });
            return;
        }

        case 'rename_project': {
            const project = projectByRef(action.project);
            if (!project) return;
            const name = action.name.trim();
            if (String(project.name) === name) {
                warn('no_change', `проект уже называется «${name}»`);
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
    }
}

const TASK_CREATE_FIELDS = ['status', 'plannedStartDate', 'plannedDuration', 'progress', 'description'];

function buildDiff(overlay: Overlay, mutations: Mutation[], cascades: Map<string, { tasks: number; boardLinks: number; taskTypes: number }>): DiffItem[] {
    const projectName = (id: unknown): string | undefined => {
        const row = overlay.get('projects', String(id)) ?? overlay.original('projects', String(id));
        return row ? String(row.name) : undefined;
    };
    const items: DiffItem[] = [];

    for (const m of mutations) {
        if (m.table === 'tasks') {
            if (m.op === 'insert') {
                const row = m.row;
                const changes: FieldChange[] = TASK_CREATE_FIELDS.map(field => ({ field, from: null, to: row[field] }));
                let steps: unknown[] = [];
                try { steps = JSON.parse(String(row.steps ?? '[]')) as unknown[]; } catch { steps = []; }
                if (steps.length) changes.push({ field: 'steps', from: null, to: steps.map(s => (s as { text: string }).text) });
                items.push({ entity: 'task', op: 'create', id: String(row.id), label: String(row.title), projectId: String(row.projectId), projectName: projectName(row.projectId), changes });
            } else if (m.op === 'update') {
                const before = overlay.original('tasks', m.id) as Row;
                const after = overlay.get('tasks', m.id) as Row;
                const changes = Object.keys(m.patch).map(field => ({ field, from: before[field] ?? null, to: m.patch[field] }));
                items.push({ entity: 'task', op: 'update', id: m.id, label: String(after.title), projectId: String(after.projectId), projectName: projectName(after.projectId), changes });
            } else {
                const before = overlay.original('tasks', m.id) as Row;
                items.push({ entity: 'task', op: 'delete', id: m.id, label: String(before.title), projectId: String(before.projectId), projectName: projectName(before.projectId), changes: [] });
            }
        } else if (m.table === 'projects') {
            if (m.op === 'insert') {
                items.push({ entity: 'project', op: 'create', id: String(m.row.id), label: String(m.row.name), changes: [{ field: 'name', from: null, to: m.row.name }] });
            } else if (m.op === 'update') {
                const before = overlay.original('projects', m.id) as Row;
                items.push({ entity: 'project', op: 'update', id: m.id, label: String(m.patch.name ?? before.name), changes: Object.keys(m.patch).map(field => ({ field, from: before[field] ?? null, to: m.patch[field] })) });
            } else {
                const before = overlay.original('projects', m.id) as Row;
                items.push({ entity: 'project', op: 'delete', id: m.id, label: String(before.name), changes: [], cascade: cascades.get(m.id) });
            }
        }
    }
    // Cascade-deleted tasks are summarised on their project, not listed one by one.
    const cascadedTaskIds = new Set<string>();
    for (const m of mutations) {
        if (m.table === 'projects' && m.op === 'delete') {
            for (const t of overlay.touched) {
                if (t.table !== 'tasks') continue;
                const before = overlay.original('tasks', t.id);
                if (before && before.projectId === m.id) cascadedTaskIds.add(t.id);
            }
        }
    }
    return items.filter(i => !(i.entity === 'task' && i.op === 'delete' && cascadedTaskIds.has(i.id)));
}
