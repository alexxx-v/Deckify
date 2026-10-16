import dayjs from 'dayjs';

/** Fixed "now" so every run (and every model) sees the same calendar. 2026-10-13 is a Tuesday. */
export const TODAY = '2026-10-13';

const uid = (kind, n) => `${kind}0000000-0000-4000-8000-${String(n).padStart(12, '0')}`;

export const projects = [
    { id: uid('a', 1), name: 'KYC', createdAt: 1 },
    { id: uid('a', 2), name: 'Мобильное приложение', createdAt: 2 },
    { id: uid('a', 3), name: 'Маркетинг', createdAt: 3 },
    // Deliberately similar to "KYC": renaming/deleting "KYC" must not hit this one.
    { id: uid('a', 4), name: 'KYC Legacy', createdAt: 4 },
];

const [KYC, MOBILE, MARKETING, LEGACY] = projects.map(p => p.id);

const task = (n, projectId, title, status, startDate, duration, extra = {}) => ({
    id: uid('b', n),
    projectId,
    title,
    description: '',
    startDate,
    duration,
    plannedStartDate: startDate,
    plannedDuration: duration,
    progress: status === 'done' ? 100 : status === 'progress' ? 40 : 0,
    status,
    steps: '[]',
    taskTypeId: null,
    ...extra,
});

export const tasks = [
    task(1, KYC, 'Проверка паспортов', 'progress', '2026-10-05', 10),
    task(2, KYC, 'Интеграция с Госуслугами', 'progress', '2026-10-08', 14),
    task(3, KYC, 'Скоринг клиентов', 'backlog', '2026-10-20', 7),
    task(4, KYC, 'Отчёт для регулятора', 'hold', '2026-09-20', 10),
    task(5, KYC, 'Анкета клиента', 'done', '2026-09-01', 14),
    task(6, KYC, 'Верификация адреса', 'progress', '2026-09-28', 10),
    task(7, MOBILE, 'Экран логина', 'progress', '2026-10-06', 8),
    task(8, MOBILE, 'Push-уведомления', 'backlog', '2026-10-27', 12),
    task(9, MOBILE, 'Релиз 2.0', 'backlog', '2026-11-16', 5),
    task(10, MOBILE, 'Тёмная тема', 'done', '2026-09-10', 6),
    task(11, MARKETING, 'Лендинг', 'progress', '2026-10-01', 20),
    task(12, MARKETING, 'Email-рассылка', 'backlog', '2026-10-19', 5),
    // Overdue and in progress, but in KYC Legacy — must never show up in answers about KYC.
    task(13, LEGACY, 'Миграция старых анкет', 'progress', '2026-09-15', 10),
    task(14, LEGACY, 'Архив документов', 'backlog', '2026-10-14', 6),
];

export const taskTypes = [
    { id: uid('c', 1), projectId: null, name: 'Разработка', color: '#3b82f6' },
    { id: uid('c', 2), projectId: null, name: 'Согласование', color: '#f59e0b' },
];

export const boards = [{ id: uid('d', 1), name: 'Спринт 5', createdAt: 1 }];

export const byTitle = title => {
    const t = tasks.find(x => x.title === title);
    if (!t) throw new Error(`fixture task not found: ${title}`);
    return t;
};

export const projectByName = name => {
    const p = projects.find(x => x.name === name);
    if (!p) throw new Error(`fixture project not found: ${name}`);
    return p;
};

/**
 * Compact text block handed to the model together with the request.
 * `screen` is `{ projectName }` for an open project, or null for the home screen.
 * Phase 4's context builder should start from the same layout.
 */
export function contextFor(screen) {
    const lines = [];
    lines.push(`Сегодня: ${TODAY} (${dayjs(TODAY).locale('en').format('dddd')})`);
    if (screen?.projectName) {
        const p = projectByName(screen.projectName);
        lines.push(`Открытый экран: проект «${p.name}» (id ${p.id})`);
    } else {
        lines.push('Открытый экран: список проектов');
    }
    lines.push('', 'Проекты (id | название | задач):');
    for (const p of projects) {
        lines.push(`${p.id} | ${p.name} | ${tasks.filter(t => t.projectId === p.id).length}`);
    }
    lines.push('', 'Задачи (id | проект | название | статус | старт | длительность, дн.):');
    for (const t of tasks) {
        const project = projects.find(p => p.id === t.projectId).name;
        lines.push(`${t.id} | ${project} | ${t.title} | ${t.status} | ${t.startDate} | ${t.duration}`);
    }
    lines.push('', 'Типы задач: ' + taskTypes.map(t => t.name).join(', '));
    lines.push('Доски: ' + boards.map(b => b.name).join(', '));
    return lines.join('\n');
}
