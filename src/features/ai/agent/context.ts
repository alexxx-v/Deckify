import dayjs from 'dayjs';
import type { DbOps, Row } from '../../../db/ops.ts';
import { getEffectiveDuration, getEffectiveEnd, getEffectiveStartDate } from '../../../lib/taskDates.ts';
import type { TaskDates } from '../../../lib/taskDates.ts';

/*
 * The data block sent with every user message. Layout follows the one measured in the Phase 1 spike
 * (scripts/ai-spike/fixtures.mjs `contextFor`); additions: effective dates, a trailing "просрочена" marker the
 * app computes (the model should not do date arithmetic) and a budget with an explicit truncation note.
 * Task descriptions are never included (size and privacy).
 */

export type Tab = 'dashboard' | 'projects' | 'boards' | 'settings' | 'templates';

/** What is open in the app, with the same precedence as the render chain in App.tsx. */
export interface ScreenInfo {
    tab: Tab;
    projectId: string | null;
    taskId: string | null;
    boardId: string | null;
    projectSettingsId: string | null;
}

export const MAX_CONTEXT_TASKS = 150;
export const MAX_CONTEXT_CHARS = 24000;
const MAX_PROJECTS = 100;
const MAX_NAMES = 30;

export interface BuiltContext {
    text: string;
    shownTasks: number;
    totalTasks: number;
    truncated: boolean;
}

const TAB_LABELS: Record<Tab, string> = {
    dashboard: 'дашборд',
    projects: 'список проектов',
    boards: 'список досок',
    settings: 'настройки',
    templates: 'шаблоны PDF',
};

function screenLine(ops: DbOps, screen: ScreenInfo): { line: string; focusProjectId: string | null } {
    if (screen.taskId) {
        const task = ops.get('tasks', screen.taskId);
        if (task) {
            const project = ops.get('projects', String(task.projectId));
            return { line: `задача «${String(task.title)}» (id ${String(task.id)}) в проекте «${String(project?.name ?? '')}»`, focusProjectId: String(task.projectId) };
        }
    }
    if (screen.projectSettingsId) {
        const project = ops.get('projects', screen.projectSettingsId);
        if (project) return { line: `настройки проекта «${String(project.name)}» (id ${String(project.id)})`, focusProjectId: String(project.id) };
    }
    if (screen.boardId) {
        const board = ops.get('boards', screen.boardId);
        if (board) return { line: `доска «${String(board.name)}» (id ${String(board.id)})`, focusProjectId: null };
    }
    if (screen.projectId) {
        const project = ops.get('projects', screen.projectId);
        if (project) return { line: `проект «${String(project.name)}» (id ${String(project.id)})`, focusProjectId: String(project.id) };
    }
    return { line: TAB_LABELS[screen.tab], focusProjectId: null };
}

/** Lower number = shown earlier when the budget runs out. */
function priority(status: string, overdue: boolean): number {
    if (overdue) return 0;
    if (status === 'progress' || status === 'hold') return 1;
    if (status === 'backlog') return 2;
    return 3;
}

export function buildContext(
    ops: DbOps,
    args: { today: string; screen: ScreenInfo; maxTasks?: number; maxChars?: number },
): BuiltContext {
    const { today, screen } = args;
    const maxTasks = args.maxTasks ?? MAX_CONTEXT_TASKS;
    const maxChars = args.maxChars ?? MAX_CONTEXT_CHARS;
    const { line, focusProjectId } = screenLine(ops, screen);

    const projects = ops.select('projects', {}, ['createdAt']);
    const names = new Map(projects.map(p => [String(p.id), String(p.name)]));
    const tasks = ops.select('tasks');
    const typeNames = new Map(ops.select('task_types').map(t => [String(t.id), String(t.name)]));
    const counts = new Map<string, number>();
    for (const t of tasks) counts.set(String(t.projectId), (counts.get(String(t.projectId)) ?? 0) + 1);

    const entries = tasks.map(t => {
        const dates = t as unknown as TaskDates;
        const end = getEffectiveEnd(dates);
        const status = String(t.status ?? 'backlog');
        const overdue = status !== 'done' && end.isValid() && end.isBefore(dayjs(today), 'day');
        return {
            row: t as Row,
            start: getEffectiveStartDate(dates),
            overdue,
            focus: focusProjectId !== null && t.projectId === focusProjectId,
            endMs: end.isValid() ? end.valueOf() : 0,
            group: priority(status, overdue),
        };
    });
    entries.sort((a, b) => Number(b.focus) - Number(a.focus) || a.group - b.group
        // inside a group: soonest first, except finished tasks where the most recent matter more
        || (a.group === 3 ? b.endMs - a.endMs : a.start.localeCompare(b.start)));

    const taskLines: string[] = [];
    let chars = 0;
    for (const e of entries) {
        if (taskLines.length >= maxTasks) break;
        const t = e.row;
        const text = `${String(t.id)} | ${names.get(String(t.projectId)) ?? ''} | ${String(t.title)} | ${String(t.status ?? 'backlog')} | ${e.start} | ${getEffectiveDuration(t as unknown as TaskDates)}${t.taskTypeId && typeNames.has(String(t.taskTypeId)) ? ` | тип «${typeNames.get(String(t.taskTypeId))}»` : ''}${e.overdue ? ' | просрочена' : ''}`;
        if (chars + text.length > maxChars) break;
        chars += text.length + 1;
        taskLines.push(text);
    }
    const truncated = taskLines.length < entries.length;

    const out: string[] = [];
    out.push(`Сегодня: ${today} (${dayjs(today).locale('en').format('dddd')})`);
    out.push(`Открытый экран: ${line}`);
    out.push('', 'Проекты (id | название | задач):');
    for (const p of projects.slice(0, MAX_PROJECTS)) out.push(`${String(p.id)} | ${String(p.name)} | ${counts.get(String(p.id)) ?? 0}`);
    if (projects.length > MAX_PROJECTS) out.push(`… и ещё ${projects.length - MAX_PROJECTS} проектов`);
    out.push('', 'Задачи (id | проект | название | статус | старт | длительность, дн.):');
    out.push(...taskLines);
    if (truncated) {
        out.push(`Показаны ${taskLines.length} из ${entries.length} задач (сначала открытый проект и активные). Если нужной задачи нет в списке, найди её запросом list_tasks через queries, а не проси пользователя уточнить.`);
    }

    // Boards and task types carry ids: the model must be able to tell two same-named ones apart.
    const linkCounts = new Map<string, number>();
    for (const l of ops.select('board_tasks')) linkCounts.set(String(l.boardId), (linkCounts.get(String(l.boardId)) ?? 0) + 1);
    const boards = ops.select('boards', {}, ['createdAt']);
    out.push('', 'Доски (id | название | задач):');
    for (const b of boards.slice(0, MAX_NAMES)) out.push(`${String(b.id)} | ${String(b.name)} | ${linkCounts.get(String(b.id)) ?? 0}`);
    if (boards.length > MAX_NAMES) out.push(`… и ещё ${boards.length - MAX_NAMES} досок`);
    const types = ops.select('task_types');
    out.push('', 'Типы задач (id | название | область):');
    for (const t of types.slice(0, MAX_NAMES)) out.push(`${String(t.id)} | ${String(t.name)} | ${t.projectId ? (names.get(String(t.projectId)) ?? 'проект') : 'общий'}`);
    if (types.length > MAX_NAMES) out.push(`… и ещё ${types.length - MAX_NAMES} типов`);

    return { text: out.join('\n'), shownTasks: taskLines.length, totalTasks: entries.length, truncated };
}
