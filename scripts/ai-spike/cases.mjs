import dayjs from 'dayjs';
import { tasks, byTitle, projectByName } from './fixtures.mjs';

/*
 * 10 reference requests. For each case:
 *   user      — what the person types (Russian)
 *   screen    — { projectName } | null  (what is open in the app)
 *   expected  — partial normalized effects (see score.mjs) + reply checks
 *   gold      — a plan in the model-facing format that must score ok; used only by the scorer self-test
 *
 * Cases 8–10 are held out: the system prompt in run.mjs is not tuned against them.
 */

const kyc = projectByName('KYC').id;
const marketing = projectByName('Маркетинг').id;
const kycTasks = tasks.filter(t => t.projectId === kyc);
const shiftDays = (t, n) => dayjs(t.startDate).add(n, 'day').format('YYYY-MM-DD');

const progressKyc = kycTasks.filter(t => t.status === 'progress');
const doneIds = ['Экран логина', 'Push-уведомления'].map(title => byTitle(title).id);

// Overdue = ends before 2026-10-13 and not done.
const overdueKyc = kycTasks.filter(t => t.status !== 'done' && dayjs(t.startDate).add(t.duration, 'day').isBefore('2026-10-13'));
const notOverdueKyc = kycTasks.filter(t => !overdueKyc.includes(t));

export const cases = [
    {
        id: 'create-basic',
        user: 'создай задачу: настроить проверку биометрии, старт сегодня, срок 7 дней, опиши шаги',
        screen: { projectName: 'KYC' },
        expected: { effects: [{ op: 'create_task', projectId: kyc, start: '2026-10-13', durationDays: 7, hasDescription: true, hasSteps: true }] },
        gold: { reply: 'Создам задачу в KYC.', actions: [{ type: 'create_task', project: 'KYC', title: 'Настроить проверку биометрии', description: 'Подключить и проверить биометрию.', start: 'today', duration: '7d', steps: ['Выбрать провайдера', 'Подключить SDK', 'Протестировать'] }] },
    },
    {
        id: 'create-relative',
        user: 'в проекте Маркетинг создай задачу «Запуск рекламной кампании», начать через 3 дня, на 2 недели',
        screen: null,
        expected: { effects: [{ op: 'create_task', projectId: marketing, title: 'Запуск рекламной кампании', start: '2026-10-16', durationDays: 14 }] },
        gold: { reply: '', actions: [{ type: 'create_task', project: 'Маркетинг', title: 'Запуск рекламной кампании', start: '+3d', duration: '2w' }] },
    },
    {
        id: 'bulk-shift',
        user: 'сдвинь все задачи в работе проекта KYC на неделю вперёд',
        screen: null,
        expected: { effects: progressKyc.map(t => ({ op: 'update_task', taskId: t.id, start: shiftDays(t, 7) })) },
        gold: { reply: '', actions: [{ type: 'update_tasks', filter: { project: 'KYC', status: 'progress' }, set: { shift: '+1w' } }] },
    },
    {
        id: 'bulk-status',
        user: 'отметь задачи «Экран логина» и «Push-уведомления» как выполненные',
        screen: null,
        expected: { effects: doneIds.map(id => ({ op: 'update_task', taskId: id, status: 'done' })) },
        gold: { reply: '', actions: [{ type: 'update_tasks', filter: { ids: doneIds }, set: { status: 'done' } }] },
    },
    {
        id: 'rename-project',
        user: 'переименуй проект KYC в KYC 2.0',
        screen: null,
        expected: { effects: [{ op: 'rename_project', projectId: kyc, name: 'KYC 2.0' }] },
        gold: { reply: '', actions: [{ type: 'rename_project', project: 'KYC', name: 'KYC 2.0' }] },
    },
    {
        id: 'delete-task',
        user: 'удали задачу «Анкета клиента»',
        screen: { projectName: 'KYC' },
        expected: { effects: [{ op: 'delete_task', taskId: byTitle('Анкета клиента').id }] },
        gold: { reply: '', actions: [{ type: 'delete_tasks', ids: [byTitle('Анкета клиента').id] }] },
    },
    {
        id: 'delete-project',
        user: 'удали проект Маркетинг',
        screen: null,
        expected: { effects: [{ op: 'delete_project', projectId: marketing }] },
        gold: { reply: '', actions: [{ type: 'delete_project', project: 'Маркетинг' }] },
    },
    {
        id: 'screen-context',
        user: 'добавь задачу «Обновить политику хранения данных» на 5 дней, начало завтра',
        screen: { projectName: 'KYC' },
        expected: { effects: [{ op: 'create_task', projectId: kyc, start: '2026-10-14', durationDays: 5 }] },
        gold: { reply: '', actions: [{ type: 'create_task', project: 'KYC', title: 'Обновить политику хранения данных', start: '+1d', duration: '5d' }] },
    },
    {
        id: 'ambiguous',
        user: 'сдвинь задачи',
        screen: null,
        expected: { effects: [], clarification: true },
        gold: { reply: 'Какие задачи сдвинуть и на сколько?', actions: [] },
    },
    {
        id: 'data-question',
        user: 'что просрочено в KYC?',
        screen: null,
        expected: {
            effects: [],
            replyIncludes: overdueKyc.map(t => t.title),
            replyExcludes: [...notOverdueKyc.map(t => t.title), 'Миграция старых анкет'],
        },
        gold: { reply: `Просрочено: ${overdueKyc.map(t => t.title).join(', ')}.`, actions: [] },
    },
];

if (cases.length !== 10) throw new Error(`expected 10 cases, got ${cases.length}`);
for (const c of cases) {
    const e = c.expected;
    if (!e.effects.length && !e.clarification && !e.replyIncludes) throw new Error(`case ${c.id} has an empty expectation`);
}
