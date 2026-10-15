import dayjs from 'dayjs';
import type { DbOps, Row } from '../../../db/ops.ts';
import { getEffectiveDuration, getEffectiveEnd, getEffectiveStartDate, taskOverlapsRange } from '../../../lib/taskDates.ts';
import type { TaskDates } from '../../../lib/taskDates.ts';
import { resolveProjectRef } from './resolve.ts';
import { STATUSES } from './specs.ts';

/*
 * Read-only views for the agent. Outputs are deliberately compact (they go back into the model context) and use
 * EFFECTIVE dates — actual, falling back to planned — exactly like the roadmap does. Errors are returned as
 * `{ error }` in Russian so the model can correct its next call.
 */

export interface ProjectSummary {
    id: string;
    name: string;
    taskCount: number;
}

export interface TaskSummary {
    id: string;
    projectId: string;
    project: string;
    title: string;
    status: string;
    progress: number;
    start: string;
    durationDays: number;
    end: string;
    /** End date passed and the task is not done. */
    overdue: boolean;
}

export interface ListTasksFilter {
    project?: string;
    status?: string;
    overdue?: boolean;
    from?: string;
    to?: string;
    query?: string;
    limit?: number;
}

export type ListTasksResult = { tasks: TaskSummary[]; total: number; truncated: boolean } | { error: string };

export interface TaskDetail extends TaskSummary {
    description: string;
    steps: { text: string; completed: boolean }[];
    planned: { start: string | null; durationDays: number | null };
    actual: { start: string | null; durationDays: number | null };
    taskTypeId: string | null;
}

const DEFAULT_LIMIT = 100;
const MAX_LIMIT = 200;
const DESCRIPTION_CHARS = 2000;
const DAY = 'YYYY-MM-DD';

export function listProjects(ops: DbOps): ProjectSummary[] {
    const counts = new Map<string, number>();
    for (const t of ops.select('tasks')) counts.set(String(t.projectId), (counts.get(String(t.projectId)) ?? 0) + 1);
    return ops.select('projects', {}, ['createdAt']).map(p => ({ id: String(p.id), name: String(p.name), taskCount: counts.get(String(p.id)) ?? 0 }));
}

function summarize(task: Row, projectName: string, today: string): TaskSummary {
    const dates = task as unknown as TaskDates;
    const end = getEffectiveEnd(dates);
    const status = String(task.status ?? 'backlog');
    return {
        id: String(task.id),
        projectId: String(task.projectId),
        project: projectName,
        title: String(task.title),
        status,
        progress: Number(task.progress ?? 0),
        start: getEffectiveStartDate(dates),
        durationDays: getEffectiveDuration(dates),
        end: end.isValid() ? end.format(DAY) : '',
        overdue: status !== 'done' && end.isValid() && end.isBefore(dayjs(today), 'day'),
    };
}

export function listTasks(ops: DbOps, today: string, filter: ListTasksFilter = {}): ListTasksResult {
    const projects = ops.select('projects');
    const names = new Map(projects.map(p => [String(p.id), String(p.name)]));

    let rows: Row[];
    if (filter.project) {
        const ref = resolveProjectRef(filter.project, projects);
        if (!ref.ok) return { error: ref.message };
        rows = ops.select('tasks', { projectId: ref.project.id });
    } else {
        rows = ops.select('tasks');
    }
    if (filter.status) {
        if (!(STATUSES as readonly string[]).includes(filter.status)) return { error: `status должен быть одним из ${STATUSES.join('/')}` };
        rows = rows.filter(t => t.status === filter.status);
    }
    if (filter.from || filter.to) {
        const from = dayjs(filter.from ?? '1900-01-01').startOf('day');
        const to = dayjs(filter.to ?? '2200-12-31').endOf('day');
        if (!from.isValid() || !to.isValid()) return { error: 'from и to должны быть датами YYYY-MM-DD' };
        rows = rows.filter(t => taskOverlapsRange(t as unknown as TaskDates, from, to));
    }
    const q = filter.query?.trim().toLowerCase();
    if (q) rows = rows.filter(t => String(t.title).toLowerCase().includes(q));

    let tasks = rows.map(t => summarize(t, names.get(String(t.projectId)) ?? '', today));
    if (filter.overdue !== undefined) tasks = tasks.filter(t => t.overdue === filter.overdue);
    tasks.sort((a, b) => a.start.localeCompare(b.start) || a.title.localeCompare(b.title));

    const limit = Math.min(Math.max(Math.trunc(filter.limit ?? DEFAULT_LIMIT) || DEFAULT_LIMIT, 1), MAX_LIMIT);
    return { tasks: tasks.slice(0, limit), total: tasks.length, truncated: tasks.length > limit };
}

const htmlToText = (html: string) => html.replace(/<\/(p|li|h[1-6]|div)>/gi, '\n').replace(/<[^>]+>/g, '').replace(/\n{2,}/g, '\n').trim();

export function getTask(ops: DbOps, today: string, id: string): TaskDetail | { error: string } {
    const task = ops.get('tasks', id);
    if (!task) return { error: `задача с id «${id}» не найдена; бери id только из контекста или list_tasks` };
    const project = ops.get('projects', String(task.projectId));
    let steps: { text: string; completed: boolean }[] = [];
    try {
        const parsed = JSON.parse(String(task.steps ?? '[]')) as { text?: unknown; completed?: unknown }[];
        steps = parsed.map(s => ({ text: String(s.text ?? ''), completed: s.completed === true }));
    } catch {
        steps = [];
    }
    const text = htmlToText(String(task.description ?? ''));
    return {
        ...summarize(task, project ? String(project.name) : '', today),
        description: text.length > DESCRIPTION_CHARS ? `${text.slice(0, DESCRIPTION_CHARS)}…` : text,
        steps,
        planned: { start: (task.plannedStartDate as string | null) || null, durationDays: (task.plannedDuration as number | null) || null },
        actual: { start: (task.startDate as string | null) || null, durationDays: (task.duration as number | null) || null },
        taskTypeId: (task.taskTypeId as string | null) ?? null,
    };
}
