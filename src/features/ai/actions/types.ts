// Node-runnable (see CLAUDE.md, AI section): explicit `.ts` imports, `import type`, no enums / parameter properties.
import type { Row, TableName } from '../../../db/ops.ts';

export type TaskStatusValue = 'backlog' | 'progress' | 'hold' | 'done';

export interface TaskFilter {
    project?: string;
    status?: TaskStatusValue;
    ids?: string[];
}

export interface TaskSet {
    shift?: string;
    start?: string;
    duration?: string;
    status?: TaskStatusValue;
    title?: string;
    description?: string;
    progress?: number;
}

/** The plan contract fixed by the Phase 1 spike (docs/plans/2026-10-13-ai-assistant-spike-results.md). */
export type Action =
    | { type: 'create_task'; project: string; title: string; description?: string; start: string; duration: string; steps?: string[]; status?: TaskStatusValue; taskType?: string }
    | { type: 'update_tasks'; filter: TaskFilter; set: TaskSet }
    | { type: 'delete_tasks'; ids: string[] }
    | { type: 'create_project'; name: string }
    | { type: 'rename_project'; project: string; name: string }
    | { type: 'delete_project'; project: string }
    | { type: 'create_board'; name: string }
    | { type: 'rename_board'; board: string; name: string }
    | { type: 'delete_board'; board: string }
    | { type: 'add_to_board'; board: string; filter: TaskFilter }
    | { type: 'remove_from_board'; board: string; filter: TaskFilter }
    | { type: 'create_task_type'; name: string; color?: string; project?: string }
    | { type: 'update_task_type'; taskType: string; name?: string; color?: string; global?: boolean }
    | { type: 'delete_task_type'; taskType: string }
    | { type: 'set_task_type'; filter: TaskFilter; taskType: string };

export type ActionType = Action['type'];

export interface Plan {
    reply: string;
    actions: Action[];
}

export interface PlanIssue {
    severity: 'error' | 'warning';
    /** Stable code so the UI can localize; `message` is Russian and meant for the model / retry prompt. */
    code: string;
    message: string;
    actionIndex?: number;
    /** Values for the localized UI text of this code (the Russian `message` stays for the model). */
    params?: Record<string, string | number>;
}

export type Mutation =
    | { op: 'insert'; table: TableName; row: Row }
    | { op: 'update'; table: TableName; id: string; patch: Row }
    | { op: 'delete'; table: TableName; id: string };

/** A row as it was when the plan was resolved; `null` means "must not exist yet". */
export interface Precondition {
    table: TableName;
    id: string;
    row: Row | null;
}

export interface FieldChange {
    field: string;
    from: unknown;
    to: unknown;
}

export interface DiffItem {
    entity: 'task' | 'project' | 'board' | 'task_type';
    op: 'create' | 'update' | 'delete';
    id: string;
    label: string;
    projectId?: string;
    projectName?: string;
    changes: FieldChange[];
    /** What goes away or changes with the entity (affected tasks are not listed one by one). Only non-zero parts matter. */
    cascade?: { tasks?: number; boardLinks?: number; taskTypes?: number; unassignedTasks?: number };
}

export interface ResolvedPlan {
    id: string;
    createdAt: number;
    today: string;
    reply: string;
    diff: DiffItem[];
    mutations: Mutation[];
    preconditions: Precondition[];
    warnings: PlanIssue[];
    /** Every task the plan touches, including tasks removed by a project cascade (for the unsaved-form check). */
    affectedTaskIds: string[];
    affectedProjectIds: string[];
}

export type ValidateResult = { ok: true; plan: Plan } | { ok: false; issues: PlanIssue[] };
export type ResolveResult = { ok: true; plan: ResolvedPlan } | { ok: false; issues: PlanIssue[] };

export interface EntityRef {
    table: TableName;
    id: string;
    label: string;
}

export interface UndoEntry extends EntityRef {
    before: Row | null;
    after: Row | null;
}

export interface UndoRecord {
    version: 1;
    planId: string;
    createdAt: number;
    dbPath: string;
    /** What the plan did, structured so the UI can localize the undo button. */
    summary: { op: DiffItem['op']; entity: DiffItem['entity']; label: string }[];
    entries: UndoEntry[];
}

/** Rows of tasks, projects, boards and task types; board links are counted separately in `linked` / `unlinked`. */
export interface Counts {
    created: number;
    updated: number;
    deleted: number;
    /** Board links added / removed on their own (not as a cascade of deleting a task or a board). Present only when non-zero. */
    linked?: number;
    unlinked?: number;
}

export type ExecuteResult =
    /** `undo: 'none'` — the plan changed nothing, so the previous undo record is left alone. */
    | { ok: true; planId: string; counts: Counts; undo: 'saved' | 'failed' | 'none'; undoError?: string }
    | { ok: false; reason: 'stale'; stale: EntityRef[] }
    | { ok: false; reason: 'error'; message: string };

export type UndoResult =
    /** `touched`: every row the undo wrote; `removed`: rows it deleted (they were created by the undone plan). */
    | { ok: true; planId: string; restored: Counts; summary: UndoRecord['summary']; touched: EntityRef[]; removed: EntityRef[] }
    | { ok: false; reason: 'none' | 'corrupt' }
    | { ok: false; reason: 'conflict'; conflicts: EntityRef[] }
    | { ok: false; reason: 'error'; message: string };
