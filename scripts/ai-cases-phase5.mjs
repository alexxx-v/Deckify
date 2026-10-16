/*
 * Reference requests for Phase 5, same format as scripts/ai-spike/cases.mjs:
 *   { id, user, screen, expected: { effects[] }, gold }
 * `gold` is a plan in the model-facing format that must resolve to `expected` (checked without any model);
 * the live gate (scripts/ai-agent-live.mjs) asks the real model the same `user` text.
 * Data: freshDb() from ai-test-db.mjs (spike fixtures + board «Спринт 5» with three links + a KYC-scoped type;
 * «Экран логина» has the type «Согласование»).
 */
import { fixtures } from './ai-test-db.mjs';

const kyc = fixtures.projectByName('KYC').id;
const mobile = fixtures.projectByName('Мобильное приложение').id;
const board = fixtures.boards[0].id;
const [dev, approval] = fixtures.taskTypes.map(t => t.id);
const kycTasks = fixtures.tasks.filter(t => t.projectId === kyc);
const linked = new Set([fixtures.byTitle('Проверка паспортов').id, fixtures.byTitle('Интеграция с Госуслугами').id, fixtures.byTitle('Экран логина').id]);
const login = fixtures.byTitle('Экран логина').id;
const kycProgress = kycTasks.filter(t => t.status === 'progress');

export const actionCases = [
    {
        id: 'add-to-board', user: 'Добавь все задачи KYC в доску Спринт 5', screen: null,
        expected: { effects: kycTasks.filter(t => !linked.has(t.id)).map(t => ({ op: 'link', boardId: board, taskId: t.id })) },
        gold: { reply: '', actions: [{ type: 'add_to_board', board: 'Спринт 5', filter: { project: 'KYC' } }] },
    },
    {
        id: 'create-board', user: 'Создай доску «Релиз 2.0»', screen: null,
        expected: { effects: [{ op: 'create_board', name: 'Релиз 2.0' }] },
        gold: { reply: '', actions: [{ type: 'create_board', name: 'Релиз 2.0' }] },
    },
    {
        id: 'rename-board', user: 'Переименуй доску «Спринт 5» в «Спринт 6»', screen: null,
        expected: { effects: [{ op: 'rename_board', boardId: board, name: 'Спринт 6' }] },
        gold: { reply: '', actions: [{ type: 'rename_board', board: 'Спринт 5', name: 'Спринт 6' }] },
    },
    {
        id: 'remove-from-board', user: 'Убери задачу «Экран логина» из доски Спринт 5', screen: null,
        expected: { effects: [{ op: 'unlink', boardId: board, taskId: login }] },
        gold: { reply: '', actions: [{ type: 'remove_from_board', board: 'Спринт 5', filter: { ids: [login] } }] },
    },
    {
        id: 'delete-board', user: 'Удали доску Спринт 5', screen: null,
        expected: { effects: [{ op: 'delete_board', boardId: board }] },
        gold: { reply: '', actions: [{ type: 'delete_board', board: 'Спринт 5' }] },
    },
    {
        id: 'create-type', user: 'Создай тип задач «Дизайн» красного цвета', screen: null,
        expected: { effects: [{ op: 'create_type', name: 'Дизайн', colorHex: true, projectId: null }] },
        gold: { reply: '', actions: [{ type: 'create_task_type', name: 'Дизайн', color: '#EF4444' }] },
    },
    {
        id: 'assign-type', user: 'Назначь всем задачам KYC в работе тип «Разработка»', screen: null,
        expected: { effects: kycProgress.map(t => ({ op: 'update_task', taskId: t.id, taskTypeId: dev })) },
        gold: { reply: '', actions: [{ type: 'set_task_type', filter: { project: 'KYC', status: 'progress' }, taskType: 'Разработка' }] },
    },
    {
        id: 'create-task-with-type', user: 'Создай задачу «Дизайн экрана» в проекте Мобильное приложение, старт сегодня, срок 3 дня, тип «Разработка»', screen: null,
        expected: { effects: [{ op: 'create_task', projectId: mobile, start: '2026-10-13', durationDays: 3, taskTypeId: dev }] },
        gold: { reply: '', actions: [{ type: 'create_task', project: 'Мобильное приложение', title: 'Дизайн экрана', start: 'today', duration: '3d', taskType: 'Разработка' }] },
    },
    {
        id: 'delete-type', user: 'Удали тип задач «KYC-only»', screen: null,
        expected: { effects: [{ op: 'delete_type', typeId: 'tt-kyc-scoped' }] },
        gold: { reply: '', actions: [{ type: 'delete_task_type', taskType: 'KYC-only' }] },
    },
    {
        id: 'make-type-global', user: 'Сделай тип «KYC-only» общим для всех проектов', screen: null,
        expected: { effects: [{ op: 'update_type', typeId: 'tt-kyc-scoped', projectId: null }] },
        gold: { reply: '', actions: [{ type: 'update_task_type', taskType: 'KYC-only', global: true }] },
    },
    {
        id: 'rename-type', user: 'Переименуй тип «Согласование» в «Ревью»', screen: null,
        expected: { effects: [{ op: 'update_type', typeId: approval, name: 'Ревью' }] },
        gold: { reply: '', actions: [{ type: 'update_task_type', taskType: 'Согласование', name: 'Ревью' }] },
    },
    {
        id: 'clear-type', user: 'Сними тип у задачи «Экран логина»', screen: null,
        expected: { effects: [{ op: 'update_task', taskId: login, taskTypeId: null }] },
        gold: { reply: '', actions: [{ type: 'set_task_type', filter: { ids: [login] }, taskType: 'none' }] },
    },
];

/**
 * Data questions (Part B). Answered from the context when it is enough, otherwise through `queries`; the live gate
 * only judges the final reply. `build: 'big'` runs the case on bigDb() (400 tasks, most of them not in the context).
 */
export const queryCases = [
    {
        id: 'board-contents', user: 'Какие задачи в доске Спринт 5?', screen: null,
        expected: { effects: [], replyIncludes: ['Проверка паспортов', 'Интеграция с Госуслугами', 'Экран логина'], replyExcludes: ['Скоринг клиентов', 'Лендинг'] },
    },
    {
        id: 'tasks-without-type', user: 'Какие задачи в проекте Мобильное приложение без типа?', screen: null,
        expected: { effects: [], replyIncludes: ['Push-уведомления', 'Релиз 2.0', 'Тёмная тема'], replyExcludes: ['Экран логина'] },
    },
    {
        id: 'hidden-task-status', user: 'Какой статус у задачи «Задача 377»?', screen: null, build: 'big',
        expected: { effects: [], replyIncludesAny: ['backlog', 'бэклог'] },
    },
    {
        id: 'task-details', user: 'Опиши подробно задачу «Лендинг»: что в описании и какие шаги?', screen: null,
        expected: { effects: [], replyIncludes: ['Макет', 'Вёрстка'] },
    },
];
