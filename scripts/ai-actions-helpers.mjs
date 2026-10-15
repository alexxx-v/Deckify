/*
 * Shared by scripts/ai-actions-check.mjs and scripts/ai-agent-live.mjs: judge a ResolvedPlan (Phase 3) against the
 * `expected` effects of a spike case (scripts/ai-spike/cases.mjs).
 *
 * Planned vs actual follows the registry rules: create_task reports the PLANNED layer as start/durationDays,
 * updates report the ACTUAL `startDate`.
 */

/** ResolvedPlan.mutations → effects in the spike's vocabulary. */
export function effectsOf(plan) {
    return plan.mutations.flatMap(m => {
        if (m.table === 'tasks' && m.op === 'insert') {
            return [{ op: 'create_task', projectId: m.row.projectId, title: m.row.title, start: m.row.plannedStartDate, durationDays: m.row.plannedDuration, status: m.row.status, hasDescription: !!m.row.description, hasSteps: m.row.steps !== '[]' }];
        }
        if (m.table === 'tasks' && m.op === 'update') return [{ op: 'update_task', taskId: m.id, start: m.patch.startDate, status: m.patch.status }];
        if (m.table === 'tasks' && m.op === 'delete') return [{ op: 'delete_task', taskId: m.id }];
        if (m.table === 'projects' && m.op === 'update') return [{ op: 'rename_project', projectId: m.id, name: m.patch.name }];
        if (m.table === 'projects' && m.op === 'delete') return [{ op: 'delete_project', projectId: m.id }];
        return [];
    });
}

export const keyOf = e => `${e.op}:${e.taskId ?? e.projectId ?? ''}`;

/** Returns the list of problems (empty = the plan matches the case's expectation). */
export function matchExpected(plan, caseDef) {
    const got = new Map(effectsOf(plan).map(e => [keyOf(e), e]));
    const problems = [];
    for (const want of caseDef.expected.effects) {
        const have = got.get(keyOf(want)) ?? (want.op === 'create_task' ? [...got.values()].find(e => e.op === 'create_task') : undefined);
        if (!have) { problems.push(`missing ${keyOf(want)}`); continue; }
        for (const [k, v] of Object.entries(want)) {
            const same = k === 'title' ? String(have[k]).toLowerCase() === String(v).toLowerCase() : JSON.stringify(have[k]) === JSON.stringify(v);
            if (!same) problems.push(`${keyOf(want)} ${k}: got ${JSON.stringify(have[k])}, want ${JSON.stringify(v)}`);
        }
    }
    const wantedKeys = new Set(caseDef.expected.effects.map(keyOf));
    const extras = [...got.values()].filter(e => !wantedKeys.has(keyOf(e))
        && !(e.op === 'create_task' && wantedKeys.has('create_task:'))
        && !(e.op === 'delete_task' && caseDef.id === 'delete-project'));
    if (extras.length) problems.push(`unexpected effects: ${extras.map(keyOf).join(', ')}`);
    if (caseDef.expected.clarification || caseDef.expected.replyIncludes) {
        if (plan.mutations.length || plan.diff.length) problems.push('a reply-only plan must not change data');
    }
    return problems;
}
