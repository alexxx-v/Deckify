/*
 * Shared by scripts/ai-actions-check.mjs and scripts/ai-agent-live.mjs: judge a ResolvedPlan (Phase 3) against the
 * `expected` effects of a reference case (scripts/ai-spike/cases.mjs, scripts/ai-cases-phase5.mjs).
 *
 * Planned vs actual follows the registry rules: create_task reports the PLANNED layer as start/durationDays,
 * updates report the ACTUAL `startDate`. Changes that only exist as a cascade (links of a deleted board or task, scoped
 * types of a deleted project, tasks that lost a deleted type) are not effects of their own.
 */

/** ResolvedPlan.mutations → effects in the cases' vocabulary. */
export function effectsOf(plan) {
    const m = plan.mutations;
    const deleted = table => new Set(m.filter(x => x.table === table && x.op === 'delete').map(x => x.id));
    const goneTasks = deleted('tasks');
    const goneBoards = deleted('boards');
    const goneProjects = deleted('projects');
    const goneTypes = deleted('task_types');
    const before = (table, id) => plan.preconditions.find(p => p.table === table && p.id === id)?.row ?? null;

    return m.flatMap(x => {
        if (x.table === 'tasks' && x.op === 'insert') {
            return [{ op: 'create_task', projectId: x.row.projectId, title: x.row.title, start: x.row.plannedStartDate, durationDays: x.row.plannedDuration, status: x.row.status, hasDescription: !!x.row.description, hasSteps: x.row.steps !== '[]', taskTypeId: x.row.taskTypeId }];
        }
        if (x.table === 'tasks' && x.op === 'update') {
            const keys = Object.keys(x.patch);
            const lostDeletedType = keys.length === 1 && keys[0] === 'taskTypeId' && x.patch.taskTypeId === null && goneTypes.has(before('tasks', x.id)?.taskTypeId);
            if (lostDeletedType) return [];
            const e = { op: 'update_task', taskId: x.id, start: x.patch.startDate, status: x.patch.status };
            if ('taskTypeId' in x.patch) e.taskTypeId = x.patch.taskTypeId;
            return [e];
        }
        if (x.table === 'tasks' && x.op === 'delete') return [{ op: 'delete_task', taskId: x.id }];
        if (x.table === 'projects' && x.op === 'update') return [{ op: 'rename_project', projectId: x.id, name: x.patch.name }];
        if (x.table === 'projects' && x.op === 'delete') return [{ op: 'delete_project', projectId: x.id }];
        if (x.table === 'boards' && x.op === 'insert') return [{ op: 'create_board', name: x.row.name }];
        if (x.table === 'boards' && x.op === 'update') return [{ op: 'rename_board', boardId: x.id, name: x.patch.name }];
        if (x.table === 'boards' && x.op === 'delete') return [{ op: 'delete_board', boardId: x.id }];
        if (x.table === 'board_tasks' && x.op === 'insert') return [{ op: 'link', boardId: x.row.boardId, taskId: x.row.taskId }];
        if (x.table === 'board_tasks' && x.op === 'delete') {
            const link = before('board_tasks', x.id);
            if (!link || goneBoards.has(link.boardId) || goneTasks.has(link.taskId)) return [];
            return [{ op: 'unlink', boardId: link.boardId, taskId: link.taskId }];
        }
        if (x.table === 'task_types' && x.op === 'insert') return [{ op: 'create_type', name: x.row.name, color: x.row.color, projectId: x.row.projectId }];
        if (x.table === 'task_types' && x.op === 'update') {
            const e = { op: 'update_type', typeId: x.id };
            if ('name' in x.patch) e.name = x.patch.name;
            if ('color' in x.patch) e.color = x.patch.color;
            if ('projectId' in x.patch) e.projectId = x.patch.projectId;
            return [e];
        }
        if (x.table === 'task_types' && x.op === 'delete') {
            const type = before('task_types', x.id);
            if (type && goneProjects.has(type.projectId)) return [];
            return [{ op: 'delete_type', typeId: x.id }];
        }
        return [];
    });
}

export const keyOf = e => [e.op, e.taskId, e.boardId, e.typeId, e.projectId].map(v => v ?? '').join(':');

/** Returns the list of problems (empty = the plan matches the case's expectation). */
export function matchExpected(plan, caseDef) {
    const got = effectsOf(plan);
    const used = new Set();
    const problems = [];
    for (const want of caseDef.expected.effects) {
        // effects of created things have no known id: match them by operation
        let idx = got.findIndex((e, i) => !used.has(i) && keyOf(e) === keyOf(want));
        if (idx < 0 && want.op.startsWith('create_')) idx = got.findIndex((e, i) => !used.has(i) && e.op === want.op);
        if (idx < 0) { problems.push(`missing ${keyOf(want)}`); continue; }
        used.add(idx);
        const have = got[idx];
        for (const [k, v] of Object.entries(want)) {
            if (k === 'colorHex') {
                if (!/^#[0-9a-f]{6}$/i.test(String(have.color))) problems.push(`${keyOf(want)} color: got ${JSON.stringify(have.color)}, want #RRGGBB`);
                continue;
            }
            const same = k === 'title' || k === 'name' ? String(have[k]).toLowerCase() === String(v).toLowerCase() : JSON.stringify(have[k]) === JSON.stringify(v);
            if (!same) problems.push(`${keyOf(want)} ${k}: got ${JSON.stringify(have[k])}, want ${JSON.stringify(v)}`);
        }
    }
    const extras = got.filter((e, i) => !used.has(i) && !(e.op === 'delete_task' && caseDef.id === 'delete-project'));
    if (extras.length) problems.push(`unexpected effects: ${extras.map(keyOf).join(', ')}`);
    if (caseDef.expected.clarification || caseDef.expected.replyIncludes) {
        if (plan.mutations.length || plan.diff.length) problems.push('a reply-only plan must not change data');
    }
    return problems;
}
