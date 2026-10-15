import type { DbOps, Row, TableName } from '../../../db/ops.ts';
import type {
    Counts, EntityRef, ExecuteResult, Mutation, ResolvedPlan, UndoEntry, UndoRecord, UndoResult,
} from './types.ts';
import type { UndoStore } from './undoStore.ts';

/*
 * Applies a ResolvedPlan atomically and records how to take it back.
 *
 *  - `run` is `dbTransaction` in the app (one SQLite transaction, one UI refresh) or a plain better-sqlite3
 *    transaction in tests. The callback it receives must stay synchronous.
 *  - Before writing anything the executor re-reads every precondition row: if the user (or the MCP server)
 *    changed one since the preview, nothing is applied (`stale`).
 *  - The undo record is written AFTER the commit. The opposite failure (plan applied, no undo file) is reported
 *    to the caller as `undo: 'failed'`; the data is never at risk.
 */

export interface RunDeps {
    run: <T>(fn: (ops: DbOps) => T) => T;
    undoStore: UndoStore;
    dbPath: string;
}

export interface ExecuteDeps extends RunDeps {
    now?: () => number;
}

class StaleError extends Error {
    stale: EntityRef[];
    constructor(stale: EntityRef[]) {
        super('stale');
        this.stale = stale;
    }
}

class ConflictError extends Error {
    conflicts: EntityRef[];
    constructor(conflicts: EntityRef[]) {
        super('conflict');
        this.conflicts = conflicts;
    }
}

/** Order-independent, type-strict representation used to compare rows. */
const canon = (row: Row | null | undefined): string =>
    row ? JSON.stringify(Object.keys(row).sort().map(k => [k, row[k] ?? null])) : 'null';

function labelOf(table: TableName, row: Row | null): string {
    if (!row) return table;
    if (table === 'tasks') return String(row.title);
    if (table === 'projects' || table === 'boards' || table === 'task_types') return String(row.name);
    return `${table} ${String(row.id)}`;
}

function apply(ops: DbOps, m: Mutation): void {
    if (m.op === 'insert') ops.insert(m.table, m.row);
    else if (m.op === 'update') ops.update(m.table, m.id, m.patch);
    else ops.remove(m.table, m.id);
}

const errorMessage = (e: unknown) => (e instanceof Error ? e.message : String(e));
const COUNTED: readonly TableName[] = ['tasks', 'projects', 'boards', 'task_types'];

/**
 * What a set of row changes means to the user. Rows of tasks, projects, boards and task types are counted as
 * created / updated / deleted; board links are counted as `linked` / `unlinked` only when they are the change itself,
 * and a project's scoped task types only when they are not removed together with their project. `invert` reads the entries backwards (undo).
 */
export function countEntries(entries: UndoEntry[], invert: boolean): Counts {
    const from = (e: UndoEntry) => (invert ? e.after : e.before);
    const to = (e: UndoEntry) => (invert ? e.before : e.after);
    const gone = (table: TableName) => new Set(entries.filter(e => e.table === table && from(e) !== null && to(e) === null).map(e => e.id));
    const goneTasks = gone('tasks');
    const goneBoards = gone('boards');
    const goneProjects = gone('projects');

    const counts: Counts = { created: 0, updated: 0, deleted: 0 };
    let linked = 0;
    let unlinked = 0;
    for (const e of entries) {
        if (COUNTED.includes(e.table)) {
            // A project's own task types disappear with it; they are not what the user asked to delete.
            if (e.table === 'task_types' && to(e) === null && from(e) !== null && goneProjects.has(String((from(e) as Row).projectId))) continue;
            if (from(e) === null && to(e) !== null) counts.created++;
            else if (from(e) !== null && to(e) === null) counts.deleted++;
            else counts.updated++;
        } else if (e.table === 'board_tasks') {
            if (from(e) === null && to(e) !== null) linked++;
            else if (from(e) !== null && to(e) === null) {
                const link = from(e) as Row;
                if (!goneTasks.has(String(link.taskId)) && !goneBoards.has(String(link.boardId))) unlinked++;
            }
        }
    }
    if (linked) counts.linked = linked;
    if (unlinked) counts.unlinked = unlinked;
    return counts;
}

export function executePlan(plan: ResolvedPlan, deps: ExecuteDeps): ExecuteResult {
    // A reply-only plan must not replace the undo record of the last real change.
    if (plan.mutations.length === 0) return { ok: true, planId: plan.id, counts: { created: 0, updated: 0, deleted: 0 }, undo: 'none' };

    let entries: UndoEntry[];
    try {
        entries = deps.run(ops => {
            const stale: EntityRef[] = [];
            for (const p of plan.preconditions) {
                const now = ops.get(p.table, p.id);
                if (canon(now) !== canon(p.row)) stale.push({ table: p.table, id: p.id, label: labelOf(p.table, now ?? p.row) });
            }
            if (stale.length) throw new StaleError(stale);

            for (const m of plan.mutations) apply(ops, m);

            // `after` is read back from the database, never taken from what we meant to write.
            const seen = new Set<string>();
            const out: UndoEntry[] = [];
            for (const m of plan.mutations) {
                const id = m.op === 'insert' ? String(m.row.id) : m.id;
                const k = `${m.table}:${id}`;
                if (seen.has(k)) continue;
                seen.add(k);
                const before = plan.preconditions.find(p => p.table === m.table && p.id === id)?.row ?? null;
                out.push({ table: m.table, id, label: labelOf(m.table, before ?? ops.get(m.table, id)), before, after: ops.get(m.table, id) });
            }
            return out;
        });
    } catch (e) {
        if (e instanceof StaleError) return { ok: false, reason: 'stale', stale: e.stale };
        // Someone put the same task on the same board between the preview and the confirmation.
        if (/UNIQUE constraint failed: board_tasks/.test(errorMessage(e))) return { ok: false, reason: 'stale', stale: [{ table: 'board_tasks', id: '', label: 'board link' }] };
        return { ok: false, reason: 'error', message: errorMessage(e) };
    }

    const counts = countEntries(entries, false);

    const record: UndoRecord = {
        version: 1,
        planId: plan.id,
        createdAt: (deps.now ?? Date.now)(),
        dbPath: deps.dbPath,
        summary: plan.diff.map(d => ({ op: d.op, entity: d.entity, label: d.label })),
        entries,
    };
    try {
        deps.undoStore.write(record);
        return { ok: true, planId: plan.id, counts, undo: 'saved' };
    } catch (e) {
        return { ok: true, planId: plan.id, counts, undo: 'failed', undoError: errorMessage(e) };
    }
}

/** Reverts the last plan if nothing it touched has changed since; otherwise blocks and says what changed. */
export function undoLastPlan(deps: RunDeps): UndoResult {
    const record = deps.undoStore.read();
    if (record === 'corrupt') return { ok: false, reason: 'corrupt' };
    if (record === null || record.dbPath !== deps.dbPath) return { ok: false, reason: 'none' };

    let restored: Counts;
    try {
        restored = deps.run(ops => {
            const conflicts: EntityRef[] = [];
            for (const e of record.entries) {
                const now = ops.get(e.table, e.id);
                if (canon(now) !== canon(e.after)) conflicts.push({ table: e.table, id: e.id, label: labelOf(e.table, now ?? e.after ?? e.before) || e.label });
            }
            if (conflicts.length) throw new ConflictError(conflicts);

            for (const e of record.entries) if (e.before === null) ops.remove(e.table, e.id);
            for (const e of record.entries) if (e.before !== null) ops.upsert(e.table, e.before);

            const counts = countEntries(record.entries, true);
            return counts;
        });
    } catch (e) {
        if (e instanceof ConflictError) return { ok: false, reason: 'conflict', conflicts: e.conflicts };
        return { ok: false, reason: 'error', message: errorMessage(e) };
    }

    try {
        deps.undoStore.clear();
    } catch {
        // The data is restored; a leftover record will simply report conflicts if someone tries it again.
    }
    const ref = (e: UndoEntry): EntityRef => ({ table: e.table, id: e.id, label: e.label });
    return { ok: true, planId: record.planId, restored, summary: record.summary, touched: record.entries.map(ref), removed: record.entries.filter(e => e.before === null).map(ref) };
}

export function describeUndo(store: UndoStore, dbPath: string):
    { available: false; corrupt: boolean } | { available: true; summary: UndoRecord['summary']; createdAt: number } {
    const record = store.read();
    if (record === 'corrupt') return { available: false, corrupt: true };
    if (record === null || record.dbPath !== dbPath) return { available: false, corrupt: false };
    return { available: true, summary: record.summary, createdAt: record.createdAt };
}
