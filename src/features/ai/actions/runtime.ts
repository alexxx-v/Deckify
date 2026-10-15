import dayjs from 'dayjs';
import { v4 as uuidv4 } from 'uuid';
import { dbRead, dbTransaction, getDbPath } from '@/db/schema';
import { describeUndo, executePlan, undoLastPlan } from './execute';
import { getTask, listBoards, listProjects, listTaskTypes, listTasks } from './readTools';
import type { ListTasksFilter } from './readTools';
import { resolvePlan } from './resolve';
import type { ExecuteResult, ResolvedPlan, ResolveResult, UndoResult } from './types';
import { createFileUndoStore } from './undoStore';
import type { FsLike, UndoStore } from './undoStore';

/*
 * The registry wired to the real app: the open database (dbRead / dbTransaction, which refresh the UI once per
 * plan) and the undo file `<db>.ai-undo.json` next to it. This is the only module of the registry that touches
 * `window`; everything else is exercised by scripts/ai-actions-check.mjs.
 */

const UNAVAILABLE = 'The AI action registry needs the desktop app and an open database';

function openUndoStore(dbPath: string): UndoStore | null {
    if (typeof window === 'undefined' || !('require' in window)) return null;
    try {
        const fs = (window as unknown as { require(id: string): FsLike }).require('fs');
        return createFileUndoStore(fs, `${dbPath}.ai-undo.json`);
    } catch (err) {
        console.error('Could not open the undo store:', err);
        return null;
    }
}

function runtime(): { dbPath: string; undoStore: UndoStore } | null {
    const dbPath = getDbPath();
    if (!dbPath) return null;
    const undoStore = openUndoStore(dbPath);
    return undoStore ? { dbPath, undoStore } : null;
}

const today = () => dayjs().format('YYYY-MM-DD');

/** Validates and resolves a model plan against the open database. Read-only. */
export function resolveAiPlan(input: unknown): ResolveResult {
    try {
        return dbRead(ops => resolvePlan(input, ops, { today: today(), now: Date.now(), newId: uuidv4 }));
    } catch (err) {
        return { ok: false, issues: [{ severity: 'error', code: 'db_unavailable', message: err instanceof Error ? err.message : UNAVAILABLE }] };
    }
}

/** Applies a resolved plan in one transaction and stores its undo record. */
export function executeAiPlan(plan: ResolvedPlan): ExecuteResult {
    const rt = runtime();
    if (!rt) return { ok: false, reason: 'error', message: UNAVAILABLE };
    return executePlan(plan, { run: dbTransaction, undoStore: rt.undoStore, dbPath: rt.dbPath });
}

/** Reverts the last executed plan, unless something it touched changed since. */
export function undoAiPlan(): UndoResult {
    const rt = runtime();
    if (!rt) return { ok: false, reason: 'error', message: UNAVAILABLE };
    return undoLastPlan({ run: dbTransaction, undoStore: rt.undoStore, dbPath: rt.dbPath });
}

/** For the undo button: is there something to undo, and what was it? */
export function getAiUndoInfo() {
    const rt = runtime();
    return rt ? describeUndo(rt.undoStore, rt.dbPath) : ({ available: false, corrupt: false } as const);
}

/** Dispatches a read tool call from the model (names as in READ_TOOL_SPECS). Errors are returned, not thrown. */
export function runAiReadTool(name: string, args: unknown): unknown {
    const input = (typeof args === 'object' && args !== null ? args : {}) as Record<string, unknown>;
    try {
        return dbRead(ops => {
            switch (name) {
                case 'list_projects':
                    return listProjects(ops);
                case 'list_boards':
                    return listBoards(ops);
                case 'list_task_types':
                    return listTaskTypes(ops);
                case 'list_tasks':
                    return listTasks(ops, today(), input as ListTasksFilter);
                case 'get_task':
                    return typeof input.id === 'string' ? getTask(ops, today(), input.id) : { error: 'нужен параметр id' };
                default:
                    return { error: `неизвестный инструмент «${name}»` };
            }
        });
    } catch (err) {
        return { error: err instanceof Error ? err.message : UNAVAILABLE };
    }
}
