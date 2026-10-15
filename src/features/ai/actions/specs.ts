import type { ActionType } from './types.ts';

/*
 * Single source for what the model is told about the plan format. The property descriptions are the
 * wording measured in the Phase 1 spike (scripts/ai-spike/run.mjs) — change them only together with a re-run
 * of the spike matrix. `set` additionally accepts `description` and `progress` (optional, not yet measured).
 */

export const STATUSES = ['backlog', 'progress', 'hold', 'done'] as const;

export const MAX_ACTIONS = 50;
export const MAX_MUTATIONS = 500;
export const LIMITS = {
    title: 200,
    description: 20000,
    steps: 30,
    step: 300,
    ids: 200,
    projectName: 120,
} as const;

type JsonSchema = Record<string, unknown>;

const idList: JsonSchema = { type: 'array', items: { type: 'string' }, description: 'id задач строго из контекста' };

export const PLAN_PROPERTIES: Record<string, JsonSchema> = {
    project: { type: 'string', description: 'Название проекта или его id из контекста' },
    name: { type: 'string', description: 'Новое название' },
    title: { type: 'string', description: 'Название задачи' },
    description: { type: 'string', description: 'Описание задачи в markdown' },
    start: { type: 'string', description: 'Дата старта: today, +3d, -1w, +1m или YYYY-MM-DD. Не вычисляй дату сам.' },
    duration: { type: 'string', description: 'Длительность: 7d (дни), 2w (недели) или 1m (месяцы)' },
    steps: { type: 'array', items: { type: 'string' }, description: 'Шаги (чек-лист) задачи' },
    status: { type: 'string', enum: [...STATUSES] },
    ids: idList,
    filter: {
        type: 'object',
        description: 'Какие задачи затронуть. Хотя бы одно поле.',
        properties: {
            project: { type: 'string', description: 'Название проекта или id' },
            status: { type: 'string', enum: [...STATUSES] },
            ids: idList,
        },
    },
    set: {
        type: 'object',
        description: 'Что изменить. Хотя бы одно поле.',
        properties: {
            shift: { type: 'string', description: 'Сдвиг даты старта у каждой задачи: +1w, -3d, +1m' },
            start: { type: 'string', description: 'Новая дата старта: today, +3d или YYYY-MM-DD' },
            duration: { type: 'string', description: 'Новая длительность: 7d, 2w, 1m' },
            status: { type: 'string', enum: [...STATUSES] },
            title: { type: 'string' },
            description: { type: 'string', description: 'Новое описание задачи в markdown (заменяет прежнее)' },
            progress: { type: 'integer', minimum: 0, maximum: 100, description: 'Прогресс, 0–100' },
        },
    },
};

export interface ActionSpec {
    type: ActionType;
    description: string;
    props: string[];
    required: string[];
}

export const ACTION_SPECS: ActionSpec[] = [
    { type: 'create_task', description: 'Создать задачу в проекте.', props: ['project', 'title', 'description', 'start', 'duration', 'steps', 'status'], required: ['project', 'title', 'start', 'duration'] },
    { type: 'update_tasks', description: 'Изменить существующие задачи (в том числе массово).', props: ['filter', 'set'], required: ['filter', 'set'] },
    { type: 'delete_tasks', description: 'Удалить задачи по id.', props: ['ids'], required: ['ids'] },
    { type: 'create_project', description: 'Создать проект.', props: ['name'], required: ['name'] },
    { type: 'rename_project', description: 'Переименовать проект.', props: ['project', 'name'], required: ['project', 'name'] },
    { type: 'delete_project', description: 'Удалить проект вместе со всеми его задачами.', props: ['project'], required: ['project'] },
];

/** Mechanism A (tool calling): one tool per action. */
export function buildActionTools() {
    return ACTION_SPECS.map(a => ({
        type: 'function' as const,
        function: {
            name: a.type,
            description: a.description,
            parameters: {
                type: 'object',
                properties: Object.fromEntries(a.props.map(k => [k, PLAN_PROPERTIES[k]])),
                required: a.required,
            },
        },
    }));
}

/**
 * Mechanism B (`format`): one flat object schema — a flat shape decodes more reliably than `oneOf` on small
 * models. This is only a decoding constraint; the model does not see it, and Ollama Cloud does not enforce it,
 * so describeActionsForPrompt() must also go into the prompt.
 */
export function buildPlanFormatSchema(): JsonSchema {
    return {
        type: 'object',
        properties: {
            reply: { type: 'string', description: 'Короткий ответ пользователю: описание плана, уточняющий вопрос или ответ на вопрос о данных' },
            actions: {
                type: 'array',
                items: {
                    type: 'object',
                    properties: { type: { type: 'string', enum: ACTION_SPECS.map(a => a.type) }, ...PLAN_PROPERTIES },
                    required: ['type'],
                },
            },
        },
        required: ['reply', 'actions'],
    };
}

/** The text block that repeats the schema inside the prompt (what the spike measured for `format` mode). */
export function describeActionsForPrompt(): string {
    return `Ответь одним JSON-объектом по схеме (других ключей и типов действий нет):\n${JSON.stringify(buildPlanFormatSchema(), null, 1)}\n`
        + `Поле type каждого действия — одно из: ${ACTION_SPECS.map(a => a.type).join(', ')}. Заполняй только поля, нужные этому действию:\n`
        + ACTION_SPECS.map(a => `- ${a.type}: ${a.props.join(', ')} (обязательны: ${a.required.join(', ')}) — ${a.description}`).join('\n');
}

/** Read tools the agent may call before planning (implemented in readTools.ts). */
export const READ_TOOL_SPECS = [
    {
        type: 'function' as const,
        function: {
            name: 'list_projects',
            description: 'Список проектов с id, названием и числом задач.',
            parameters: { type: 'object', properties: {}, required: [] as string[] },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'list_tasks',
            description: 'Список задач с фильтрами. Даты — эффективные (факт, иначе план). Поле overdue: срок прошёл, а задача не завершена.',
            parameters: {
                type: 'object',
                properties: {
                    project: { type: 'string', description: 'Название проекта или id' },
                    status: { type: 'string', enum: [...STATUSES] },
                    overdue: { type: 'boolean', description: 'Только просроченные' },
                    from: { type: 'string', description: 'Пересекается с периодом начиная с YYYY-MM-DD' },
                    to: { type: 'string', description: 'Пересекается с периодом до YYYY-MM-DD' },
                    query: { type: 'string', description: 'Подстрока в названии' },
                    limit: { type: 'integer', minimum: 1, maximum: 200 },
                },
                required: [] as string[],
            },
        },
    },
    {
        type: 'function' as const,
        function: {
            name: 'get_task',
            description: 'Подробности одной задачи: описание, шаги, плановые и фактические даты.',
            parameters: {
                type: 'object',
                properties: { id: { type: 'string', description: 'id задачи из контекста или list_tasks' } },
                required: ['id'],
            },
        },
    },
];
