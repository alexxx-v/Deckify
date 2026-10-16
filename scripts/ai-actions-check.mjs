#!/usr/bin/env node
/*
 * Checks for the AI action registry (src/db/ops.ts, src/features/ai/actions/). The repo has no test runner:
 *   node scripts/ai-actions-check.mjs
 * Runs the TypeScript modules directly via Node's type stripping, against in-memory SQLite.
 *
 * The root node_modules/better-sqlite3 is built for Electron's ABI and does not load in Node, so the Node
 * build from mcp/node_modules is used (cd mcp && npm install). The suite SKIPs loudly when it is missing.
 * Never touches a real Deckify database.
 */
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

import { Database, TEST_DDL, createOps, TABLE_COLUMNS, fixtures, freshDb, dump } from './ai-test-db.mjs';

let failed = 0;
let passed = 0;
const check = (name, cond, detail = '') => {
    if (cond) { passed++; console.log(`ok   ${name}`); }
    else { failed++; console.log(`FAIL ${name} ${detail}`); }
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const throws = (name, fn, re) => {
    try { fn(); check(name, false, 'did not throw'); }
    catch (e) { check(name, re ? re.test(String(e.message)) : true, `threw ${e.message}`); }
};
const section = title => console.log(`\n# ${title}`);

// ==== ops ================================================================================================
section('ops');
{
    const { sqlite, ops } = freshDb();
    ops.assertSchema();
    check('assertSchema passes on the current schema', true);

    eq('get returns a row', ops.get('projects', fixtures.projectByName('KYC').id)?.name, 'KYC');
    eq('get returns null for a missing id', ops.get('projects', 'nope'), null);

    const kyc = fixtures.projectByName('KYC').id;
    eq('select by equality + order', ops.select('tasks', { projectId: kyc, status: 'progress' }, ['startDate']).map(t => t.title),
        ['Верификация адреса', 'Проверка паспортов', 'Интеграция с Госуслугами']);
    eq('select null means IS NULL', ops.select('task_types', { projectId: null }).length, 2);
    eq('select with no filter returns all rows', ops.select('boards').length, 1);

    ops.insert('projects', { id: 'p-new', name: 'Новый', createdAt: 5 });
    eq('insert', ops.get('projects', 'p-new'), { id: 'p-new', name: 'Новый', createdAt: 5 });
    ops.update('projects', 'p-new', { name: 'Переименован' });
    eq('update', ops.get('projects', 'p-new')?.name, 'Переименован');
    ops.update('tasks', fixtures.byTitle('Лендинг').id, { taskTypeId: undefined, description: undefined });
    eq('undefined binds as NULL', ops.get('tasks', fixtures.byTitle('Лендинг').id)?.taskTypeId, null);
    ops.upsert('projects', { id: 'p-new', name: 'Upsert', createdAt: 6 });
    eq('upsert overwrites an existing row', ops.get('projects', 'p-new'), { id: 'p-new', name: 'Upsert', createdAt: 6 });
    ops.upsert('projects', { id: 'p-up', name: 'Создан upsert', createdAt: 7 });
    eq('upsert inserts a missing row', ops.get('projects', 'p-up')?.name, 'Создан upsert');
    ops.remove('projects', 'p-new');
    eq('remove', ops.get('projects', 'p-new'), null);
    ops.remove('projects', 'never-existed');
    check('remove of a missing id is a no-op', true);

    throws('unknown table', () => ops.get('users', 'x'), /unknown table/);
    throws('prototype-key table name', () => ops.get('constructor', 'x'), /unknown table/);
    throws('table-name injection in select', () => ops.select('tasks; DROP TABLE tasks', {}), /unknown table/);
    throws('unknown column in insert', () => ops.insert('projects', { id: 'x', name: 'y', extra: 1 }), /unknown column/);
    throws('column-name injection in select', () => ops.select('tasks', { 'id = id OR 1=1 --': 1 }), /unknown column/);
    throws('column-name injection in orderBy', () => ops.select('tasks', {}, ['id; DROP TABLE tasks']), /unknown column/);
    throws('insert without id', () => ops.insert('projects', { name: 'x' }), /needs an id/);
    throws('update cannot change id', () => ops.update('projects', 'p-up', { id: 'other' }), /cannot change the id/);
    eq('tasks table survived the injection attempts', sqlite.prepare('SELECT COUNT(*) c FROM tasks').get().c, fixtures.tasks.length);

    // assertSchema must fail loudly when the schema moves under it
    const extraCol = new Database(':memory:'); extraCol.exec(TEST_DDL); extraCol.exec('ALTER TABLE tasks ADD COLUMN newcol TEXT');
    throws('assertSchema: column not listed in ops.ts', () => createOps(extraCol).assertSchema(), /not listed in ops\.ts: newcol/);
    const unknownTable = new Database(':memory:'); unknownTable.exec(TEST_DDL); unknownTable.exec('CREATE TABLE comments (id TEXT PRIMARY KEY)');
    throws('assertSchema: unknown table', () => createOps(unknownTable).assertSchema(), /unknown table\(s\) comments/);
    const missingCol = new Database(':memory:'); missingCol.exec(TEST_DDL.replace('name TEXT, color TEXT', 'name TEXT'));
    throws('assertSchema: column missing in the database', () => createOps(missingCol).assertSchema(), /missing in DB: color/);
    const noTable = new Database(':memory:'); noTable.exec(TEST_DDL.replace('CREATE TABLE boards', 'CREATE TABLE boards_old'));
    throws('assertSchema: table missing (an unknown one is present instead)', () => createOps(noTable).assertSchema(), /unknown table\(s\) boards_old/);
}

// ==== dates / specs ======================================================================================
const { resolveDate, resolveDuration, markdownToHtml } = await import('../src/features/ai/actions/dates.ts');
const specs = await import('../src/features/ai/actions/specs.ts');

section('dates');
{
    const base = fixtures.TODAY;
    eq('today', resolveDate('today', base), '2026-10-13');
    eq('+3d', resolveDate('+3d', base), '2026-10-16');
    eq('-1w', resolveDate('-1w', base), '2026-10-06');
    eq('+1m', resolveDate('+1m', base), '2026-11-13');
    eq('+1m from 2026-10-31 clamps to month end', resolveDate('+1m', '2026-10-31'), '2026-11-30');
    eq('absolute date', resolveDate('2026-12-24', base), '2026-12-24');
    eq('impossible date rejected', resolveDate('2026-02-31', base), null);
    eq('prose rejected', resolveDate('next friday', base), null);
    eq('numeric-looking token rejected', resolveDate('7', base), null);
    eq('absurd year rejected', resolveDate('+99999d', base), null);
    eq('duration days', resolveDuration('7d', base), 7);
    eq('duration weeks', resolveDuration('2w', base), 14);
    eq('duration months follow the start date (Feb)', resolveDuration('1m', '2026-02-01'), 28);
    eq('duration months (Oct)', resolveDuration('1m', '2026-10-01'), 31);
    eq('duration garbage rejected', resolveDuration('7', base), null);
    eq('markdown → html', markdownToHtml('# Заголовок\n\n- шаг 1\n- шаг 2\n\n**жирный**'), '<h1>Заголовок</h1>\n<ul>\n<li>шаг 1</li>\n<li>шаг 2</li>\n</ul>\n<p><strong>жирный</strong></p>');
    const hostile = markdownToHtml('Привет <script>alert(1)</script> **ok** <img src=x onerror=alert(1)>');
    check('raw HTML from the model is dropped', !/<script|<img|onerror=/.test(hostile) && hostile.includes('<strong>ok</strong>'), hostile);
}

section('specs');
{
    // The spike's measured definitions are a byte-identical PREFIX of ours: later phases only append.
    const src = fs.readFileSync(path.join(ROOT, 'scripts/ai-spike/run.mjs'), 'utf8');
    const from = src.indexOf('const P = {');
    const to = src.indexOf('const SYSTEM');
    check('could locate the spike definitions', from > 0 && to > from);
    const spike = new Function('STATUSES', `${src.slice(from, to)}\nreturn { P, ACTIONS, FORMAT, TOOLS };`)(specs.STATUSES);
    const clone = o => JSON.parse(JSON.stringify(o));
    const SET_EXTRAS = ['description', 'progress'];                    // Phase 3
    const NEW_PROPS = ['board', 'taskType', 'color', 'global'];        // Phase 5
    const stripSetExtras = props => { if (props?.set?.properties) SET_EXTRAS.forEach(k => delete props.set.properties[k]); return props; };
    const stripNew = props => { NEW_PROPS.forEach(k => delete props[k]); return props; };

    for (const key of Object.keys(spike.P)) {
        const own = clone(specs.PLAN_PROPERTIES[key]);
        if (key === 'set') SET_EXTRAS.forEach(k => delete own.properties[k]);
        eq(`property "${key}" identical to the spike`, own, spike.P[key]);
    }
    eq('the spike\'s property names come first, in order', Object.keys(specs.PLAN_PROPERTIES).slice(0, Object.keys(spike.P).length), Object.keys(spike.P));
    eq('property names added after the spike\'s', Object.keys(specs.PLAN_PROPERTIES).slice(Object.keys(spike.P).length), NEW_PROPS);

    const spikeActions = spike.ACTIONS;
    eq('the first six action specs are the spike\'s (create_task only gained a trailing taskType prop)',
        specs.ACTION_SPECS.slice(0, 6).map(a => a.type === 'create_task' ? { ...a, props: a.props.slice(0, -1) } : a), spikeActions);
    eq('create_task\'s extra prop is taskType', specs.ACTION_SPECS[0].props.at(-1), 'taskType');

    const ours = specs.buildActionTools();
    eq('the spike\'s tools come first, in order', ours.slice(0, 6).map(t => t.function.name), spike.TOOLS.map(t => t.function.name));
    for (let i = 0; i < 6; i++) {
        const t = clone(ours[i]);
        stripSetExtras(t.function.parameters.properties);
        delete t.function.parameters.properties.taskType;
        eq(`tool ${t.function.name} equals the spike's`, t, spike.TOOLS[i]);
    }
    const formatSchema = specs.buildPlanFormatSchema();
    const stripped = clone(formatSchema);
    const items = stripped.properties.actions.items;
    stripNew(items.properties);
    delete stripped.properties.queries;     // Phase 5: the data-question step
    stripSetExtras(items.properties);
    items.properties.type.enum = items.properties.type.enum.slice(0, 6);
    eq('format schema equals the spike\'s once the later additions are removed', stripped, spike.FORMAT);
    eq('set accepts the two Phase 3 optional fields', Object.keys(formatSchema.properties.actions.items.properties.set.properties).slice(-2), SET_EXTRAS);
    eq('all nine Phase 5 actions are in the schema enum', formatSchema.properties.actions.items.properties.type.enum.slice(6),
        ['create_board', 'rename_board', 'delete_board', 'add_to_board', 'remove_from_board', 'create_task_type', 'update_task_type', 'delete_task_type', 'set_task_type']);

    const prompt = specs.describeActionsForPrompt();
    check('prompt block lists every action type', specs.ACTION_SPECS.every(a => prompt.includes(`- ${a.type}:`)));
    check('prompt block embeds the schema', prompt.includes('"actions"') && prompt.includes('"required"'));
    eq('read tools', specs.READ_TOOL_SPECS.map(t => t.function.name), ['list_projects', 'list_tasks', 'list_boards', 'list_task_types', 'get_task']);
    eq('queries: tool enum equals the read tools the dispatcher knows', [...specs.QUERY_TOOLS].sort(), specs.READ_TOOL_SPECS.map(t => t.function.name).sort());
    eq('queries are an optional top-level array (reply and actions stay the only required keys)', [Object.keys(formatSchema.properties), formatSchema.required], [['reply', 'actions', 'queries'], ['reply', 'actions']]);
}

// ==== validate ===========================================================================================
const { validatePlan } = await import('../src/features/ai/actions/validate.ts');
const { cases } = await import('./ai-spike/cases.mjs');

section('validate');
{
    for (const c of cases) {
        const r = validatePlan(c.gold);
        check(`gold plan validates: ${c.id}`, r.ok && r.plan.actions.length === c.gold.actions.length, JSON.stringify(r));
    }
    const codes = plan => { const r = validatePlan(plan); return r.ok ? ['ok'] : r.issues.map(i => i.code); };
    const one = action => ({ reply: '', actions: [action] });
    const task = { type: 'create_task', project: 'KYC', title: 'T', start: 'today', duration: '7d' };

    eq('not an object', codes('plan'), ['bad_plan']);
    eq('missing actions array', codes({ reply: 'x' }), ['bad_plan']);
    eq('empty actions is a valid reply-only plan', codes({ reply: 'вопрос?', actions: [] }), ['ok']);
    eq('reply must be a string', codes({ reply: 5, actions: [] }), ['bad_type']);
    eq('unknown action type', codes(one({ type: 'create', entity: 'task' })), ['unknown_type']);
    eq('bad status enum', codes(one({ ...task, status: 'in_progress' })), ['bad_enum']);
    eq('prose date token', codes(one({ ...task, start: 'next friday' })), ['bad_token']);
    eq('impossible ISO date', codes(one({ ...task, start: '2026-02-31' })), ['bad_token']);
    eq('numeric duration is not coerced', codes(one({ ...task, duration: 7 })), ['bad_token']);
    eq('zero duration', codes(one({ ...task, duration: '0d' })), ['bad_token']);
    eq('missing title', codes(one({ ...task, title: undefined })), ['missing_field']);
    eq('nulls and empty strings are dropped, not errors', codes(one({ ...task, description: '', steps: null, status: null })), ['ok']);
    eq('unused keys are ignored', codes(one({ type: 'delete_project', project: 'KYC', title: 'x', entity: 'project' })), ['ok']);
    eq('empty filter', codes(one({ type: 'update_tasks', filter: {}, set: { status: 'done' } })), ['empty_filter']);
    eq('empty set', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: {} })), ['empty_set']);
    eq('unknown filter key', codes(one({ type: 'update_tasks', filter: { id: 'x' }, set: { status: 'done' } })), ['unknown_field']);
    eq('shift and start conflict', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: { shift: '+1w', start: 'today' } })), ['conflict_fields']);
    eq('shift must be relative', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: { shift: 'today' } })), ['bad_token']);
    eq('progress 101', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: { progress: 101 } })), ['bad_type']);
    eq('progress 1.5', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: { progress: 1.5 } })), ['bad_type']);
    eq('progress 0 is valid', codes(one({ type: 'update_tasks', filter: { project: 'KYC' }, set: { progress: 0 } })), ['ok']);
    eq('delete_tasks needs ids', codes(one({ type: 'delete_tasks', ids: [] })), ['bad_type']);
    eq('51 actions', codes({ reply: '', actions: Array.from({ length: 51 }, () => task) }), ['too_many']);
    eq('title too long', codes(one({ ...task, title: 'x'.repeat(201) })), ['too_long']);
    eq('31 steps', codes(one({ ...task, steps: Array.from({ length: 31 }, () => 's') })), ['too_many']);
    eq('201 ids', codes(one({ type: 'delete_tasks', ids: Array.from({ length: 201 }, (_, i) => `id${i}`) })), ['too_many']);
    eq('project name too long', codes(one({ type: 'create_project', name: 'x'.repeat(121) })), ['too_long']);

    const r = validatePlan({ reply: '', actions: [task, { ...task, duration: 'x' }] });
    check('issues carry actionIndex and a Russian message naming the action', !r.ok && r.issues[0].actionIndex === 1 && /^Действие 2:/.test(r.issues[0].message), JSON.stringify(r));
    const cleaned = validatePlan(one({ type: 'delete_project', project: 'KYC', junk: 1 }));
    eq('validated plan contains only known keys', cleaned.ok && cleaned.plan.actions[0], { type: 'delete_project', project: 'KYC' });
}

// ==== read tools =========================================================================================
const read = await import('../src/features/ai/actions/readTools.ts');
const { resolvePlan, resolveProjectRef } = await import('../src/features/ai/actions/resolve.ts');
const { matchExpected } = await import('./ai-actions-helpers.mjs');
const { TODAY } = fixtures;
const KYC = fixtures.projectByName('KYC').id;
const LEGACY = fixtures.projectByName('KYC Legacy').id;
const MARKETING = fixtures.projectByName('Маркетинг').id;
const titles = r => r.tasks.map(t => t.title);

section('read tools');
{
    const { ops, sqlite } = freshDb();
    eq('listProjects', read.listProjects(ops).map(p => [p.name, p.taskCount]),
        [['KYC', 6], ['Мобильное приложение', 4], ['Маркетинг', 2], ['KYC Legacy', 2]]);

    eq('overdue tasks of KYC (and only KYC)', titles(read.listTasks(ops, TODAY, { project: 'KYC', overdue: true })), ['Отчёт для регулятора', 'Верификация адреса']);
    eq('lookalike project is separate', titles(read.listTasks(ops, TODAY, { project: 'kyc legacy' })).sort(), ['Архив документов', 'Миграция старых анкет']);
    eq('KYC total excludes KYC Legacy', read.listTasks(ops, TODAY, { project: 'KYC' }).total, 6);
    eq('project by id', read.listTasks(ops, TODAY, { project: KYC }).total, 6);
    eq('done tasks are never overdue', read.listTasks(ops, TODAY, { project: 'KYC', status: 'done' }).tasks.map(t => t.overdue), [false]);
    eq('nothing is overdue in the past', read.listTasks(ops, '2026-09-01', { overdue: true }).total, 0);
    eq('period filter', titles(read.listTasks(ops, TODAY, { from: '2026-11-10', to: '2026-11-30' })), ['Релиз 2.0']);
    eq('query is case-insensitive', titles(read.listTasks(ops, TODAY, { query: 'PUSH' })), ['Push-уведомления']);
    const page = read.listTasks(ops, TODAY, { limit: 3 });
    eq('limit + truncated', [page.tasks.length, page.total, page.truncated], [3, 14, true]);
    eq('sorted by start', read.listTasks(ops, TODAY, { project: 'KYC' }).tasks.map(t => t.start), ['2026-09-01', '2026-09-20', '2026-09-28', '2026-10-05', '2026-10-08', '2026-10-20']);
    eq('summary shape', read.listTasks(ops, TODAY, { query: 'Лендинг' }).tasks[0],
        { id: fixtures.byTitle('Лендинг').id, projectId: MARKETING, project: 'Маркетинг', title: 'Лендинг', status: 'progress', progress: 40, start: '2026-10-01', durationDays: 20, end: '2026-10-21', overdue: false, type: null });
    check('unknown project → Russian error with hints', /не найден.*«KYC»/.test(read.listTasks(ops, TODAY, { project: 'KYC2' }).error ?? ''));
    check('bad status → error', 'error' in read.listTasks(ops, TODAY, { status: 'in_progress' }));
    check('bad date → error', 'error' in read.listTasks(ops, TODAY, { from: 'soon' }));

    // effective dates: actual layer empty → planned values are shown
    sqlite.prepare(`UPDATE tasks SET startDate = '', duration = 0 WHERE title = 'Лендинг'`).run();
    const eff = read.listTasks(ops, TODAY, { query: 'Лендинг' }).tasks[0];
    eq('effective dates fall back to planned', [eff.start, eff.durationDays, eff.end], ['2026-10-01', 20, '2026-10-21']);

    sqlite.prepare(`UPDATE tasks SET description = '<p>Привет</p><ul><li>a</li><li>b</li></ul>', steps = ? WHERE title = 'Лендинг'`)
        .run(JSON.stringify([{ id: 's1', text: 'Макет', completed: true }, { id: 's2', text: 'Вёрстка', completed: false }]));
    const detail = read.getTask(ops, TODAY, fixtures.byTitle('Лендинг').id);
    eq('getTask: description as text', detail.description, 'Привет\na\nb');
    eq('getTask: steps', detail.steps, [{ text: 'Макет', completed: true }, { text: 'Вёрстка', completed: false }]);
    eq('getTask: layers', [detail.planned, detail.actual], [{ start: '2026-10-01', durationDays: 20 }, { start: null, durationDays: null }]);
    check('getTask: unknown id → error', /не найдена/.test(read.getTask(ops, TODAY, 'nope').error));

    // duplicate project names must not be resolved by guessing
    sqlite.prepare(`INSERT INTO projects (id, name, createdAt) VALUES ('dup-1', 'Дубль', 10), ('dup-2', 'дубль ', 11)`).run();
    const ambiguous = read.listTasks(ops, TODAY, { project: 'ДУБЛЬ' });
    check('ambiguous project name → error listing ids', /неоднозначно.*dup-1.*dup-2/.test(ambiguous.error ?? ''), JSON.stringify(ambiguous));
    eq('…but an id always works', read.listTasks(ops, TODAY, { project: 'dup-2' }).total, 0);
    check('resolveProjectRef is exported for reuse', typeof resolveProjectRef === 'function');
}

section('read tools: boards and task types');
{
    const { ops, sqlite } = freshDb();
    const boardId = fixtures.boards[0].id;
    eq('listBoards', read.listBoards(ops), [{ id: boardId, name: 'Спринт 5', taskCount: 3 }]);
    eq('listTaskTypes: scope and usage', read.listTaskTypes(ops).map(t => [t.name, t.scope, t.taskCount]), [['Разработка', 'общий', 0], ['Согласование', 'общий', 1], ['KYC-only', 'KYC', 0]]);
    eq('board filter by name', titles(read.listTasks(ops, TODAY, { board: 'спринт 5' })).sort(), ['Интеграция с Госуслугами', 'Проверка паспортов', 'Экран логина']);
    eq('board filter by id, combined with a project', titles(read.listTasks(ops, TODAY, { board: boardId, project: 'KYC' })).sort(), ['Интеграция с Госуслугами', 'Проверка паспортов']);
    check('unknown board → error with the available names', /доска «Нет» не найдена.*Спринт 5/.test(read.listTasks(ops, TODAY, { board: 'Нет' }).error ?? ''));
    eq('type filter by name', titles(read.listTasks(ops, TODAY, { type: 'согласование' })), ['Экран логина']);
    eq('type "none" = tasks without a type', read.listTasks(ops, TODAY, { type: 'none' }).total, fixtures.tasks.length - 1);
    check('unknown type → error', /не найден/.test(read.listTasks(ops, TODAY, { type: 'Нет' }).error ?? ''));
    eq('the type name is part of the summary', read.listTasks(ops, TODAY, { query: 'логина' }).tasks[0].type, 'Согласование');
    const detail = read.getTask(ops, TODAY, fixtures.byTitle('Экран логина').id);
    eq('getTask: type and boards', [detail.type, detail.boards], ['Согласование', ['Спринт 5']]);
    sqlite.prepare(`INSERT INTO task_types (id, projectId, name, color) VALUES ('tt-dup', NULL, 'Согласование', '#000000')`).run();
    check('ambiguous type name → error listing both ids', /неоднозначно/.test(read.listTasks(ops, TODAY, { type: 'Согласование' }).error ?? ''));
}

// ==== resolve ============================================================================================
const mkCtx = () => { let n = 0; return { today: TODAY, now: 1_700_000_000_000, newId: () => `new-${++n}` }; };
const planOf = (...actions) => ({ reply: '', actions });
const resolveOn = (ops, plan) => resolvePlan(plan, ops, mkCtx());
const mutationsOf = (r, table, op) => r.plan.mutations.filter(m => m.table === table && m.op === op);
const messages = r => r.issues.map(i => i.message).join(' | ');

section('resolve: the 10 spike gold plans');
{
    for (const c of cases) {
        const { ops } = freshDb();
        const r = resolveOn(ops, c.gold);
        if (!r.ok) { check(`gold plan resolves: ${c.id}`, false, messages(r)); continue; }
        const problems = matchExpected(r.plan, c);
        if ((c.expected.clarification || c.expected.replyIncludes) && !r.plan.reply) problems.push('reply was lost');
        check(`gold plan resolves to the spike's expected effects: ${c.id}`, problems.length === 0, problems.join('; '));
    }
}

section('resolve: UI parity (planned vs actual)');
{
    const { ops, sqlite } = freshDb();
    const create = { type: 'create_task', project: 'KYC', title: '  Настроить биометрию ', start: 'today', duration: '7d' };

    let r = resolveOn(ops, planOf(create));
    const row = mutationsOf(r, 'tasks', 'insert')[0].row;
    eq('create_task mirrors the UI "Add task" form', row, {
        id: 'new-1', projectId: KYC, title: 'Настроить биометрию', description: '', startDate: '', duration: 0,
        plannedStartDate: '2026-10-13', plannedDuration: 7, progress: 0, status: 'backlog', steps: '[]', taskTypeId: null,
    });

    r = resolveOn(ops, planOf({ ...create, status: 'done', description: '# План\n\n- раз', steps: [' первый ', 'второй'] }));
    const done = mutationsOf(r, 'tasks', 'insert')[0].row;
    eq('create done ⇒ progress 100', done.progress, 100);
    eq('description is stored as HTML', done.description, '<h1>План</h1>\n<ul>\n<li>раз</li>\n</ul>');
    eq('steps are {id,text,completed:false}', JSON.parse(done.steps), [{ id: 'new-2', text: 'первый', completed: false }, { id: 'new-3', text: 'второй', completed: false }]);

    r = resolveOn(ops, planOf({ ...create, duration: '1m', start: '2026-02-01' }));
    eq('months follow the task start date', mutationsOf(r, 'tasks', 'insert')[0].row.plannedDuration, 28);

    // A task like the ones the UI creates: planned layer only
    const lending = fixtures.byTitle('Лендинг').id;
    sqlite.prepare(`UPDATE tasks SET startDate = '', duration = 0 WHERE id = ?`).run(lending);
    const upd = set => resolveOn(ops, planOf({ type: 'update_tasks', filter: { ids: [lending] }, set }));
    const patchOf = r2 => r2.plan.mutations.find(m => m.op === 'update' && m.id === lending)?.patch;

    eq('shift writes the ACTUAL layer from the effective values, planned untouched', patchOf(upd({ shift: '+1w' })), { startDate: '2026-10-08', duration: 20 });
    eq('negative shift', patchOf(upd({ shift: '-3d' })), { startDate: '2026-09-28', duration: 20 });
    eq('month shift', patchOf(upd({ shift: '+1m' })), { startDate: '2026-11-01', duration: 20 });
    eq('absolute start keeps the effective duration', patchOf(upd({ start: '2026-12-01' })), { startDate: '2026-12-01', duration: 20 });
    eq('duration alone also materialises the actual start', patchOf(upd({ duration: '2w' })), { startDate: '2026-10-01', duration: 14 });
    eq('start + duration together', patchOf(upd({ start: 'today', duration: '3d' })), { startDate: '2026-10-13', duration: 3 });
    eq('status done ⇒ progress 100', patchOf(upd({ status: 'done' })), { progress: 100, status: 'done' });
    eq('done wins over an explicit progress', patchOf(upd({ status: 'done', progress: 10 })), { progress: 100, status: 'done' });
    eq('other status leaves progress alone', patchOf(upd({ status: 'hold' })), { status: 'hold' });
    eq('explicit progress', patchOf(upd({ progress: 55 })), { progress: 55 });
    eq('title is trimmed, description converted', patchOf(upd({ title: ' Новый ', description: '**ок**' })), { title: 'Новый', description: '<p><strong>ок</strong></p>' });
    check('no planned column is ever written by an update', ['shift', 'start', 'duration', 'status'].every(k => {
        const set = { shift: '+1w', start: 'today', duration: '2w', status: 'done' };
        const p = patchOf(upd({ [k]: set[k] })) ?? {};
        return !('plannedStartDate' in p) && !('plannedDuration' in p);
    }));

    sqlite.prepare(`UPDATE tasks SET startDate = '2026-10-31', duration = 5 WHERE id = ?`).run(lending);
    eq('+1m from Oct 31 clamps to Nov 30', patchOf(upd({ shift: '+1m' })).startDate, '2026-11-30');
    sqlite.prepare(`UPDATE tasks SET startDate = '', duration = 0, plannedStartDate = '', plannedDuration = 0 WHERE id = ?`).run(lending);
    r = upd({ shift: '+1w' });
    check('a task with no dates at all cannot be shifted', !r.ok && r.issues[0].code === 'bad_state', messages(r));
}

section('resolve: overlay, references and errors');
{
    const { ops, sqlite } = freshDb();

    let r = resolveOn(ops, planOf(
        { type: 'create_project', name: 'Новый проект' },
        { type: 'create_task', project: 'новый проект', title: 'Первая', start: 'today', duration: '3d' },
    ));
    const newProject = mutationsOf(r, 'projects', 'insert')[0].row;
    eq('a task can reference a project created earlier in the same plan', mutationsOf(r, 'tasks', 'insert')[0].row.projectId, newProject.id);
    eq('new project row', newProject, { id: 'new-1', name: 'Новый проект', createdAt: 1_700_000_000_000 });

    const lending = fixtures.byTitle('Лендинг').id;
    r = resolveOn(ops, planOf(
        { type: 'update_tasks', filter: { ids: [lending] }, set: { shift: '+1w' } },
        { type: 'update_tasks', filter: { ids: [lending] }, set: { shift: '+1w' } },
    ));
    eq('later actions see earlier ones (shift twice = +14 days)', r.plan.mutations.find(m => m.id === lending).patch.startDate, '2026-10-15');

    r = resolveOn(ops, planOf(
        { type: 'delete_tasks', ids: [lending] },
        { type: 'update_tasks', filter: { ids: [lending] }, set: { status: 'done' } },
    ));
    check('updating a task deleted earlier in the plan is an error', !r.ok && r.issues[0].code === 'unknown_task' && /удалены ранее/.test(r.issues[0].message), messages(r));

    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC2', title: 'x', start: 'today', duration: '1d' }));
    check('unknown project → suggestions in the message', !r.ok && r.issues[0].code === 'unknown_project' && /похожие: «KYC»/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'Совсем другое', title: 'x', start: 'today', duration: '1d' }));
    check('unknown project → available names when nothing is similar', !r.ok && /доступные: «KYC»/.test(r.issues[0].message), messages(r));

    sqlite.prepare(`INSERT INTO projects (id, name, createdAt) VALUES ('dup-1', 'Дубль', 10), ('dup-2', 'дубль', 11)`).run();
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'Дубль', title: 'x', start: 'today', duration: '1d' }));
    check('ambiguous name → error naming both ids', !r.ok && r.issues[0].code === 'ambiguous_project' && /dup-1/.test(r.issues[0].message) && /dup-2/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'dup-2', title: 'x', start: 'today', duration: '1d' }));
    eq('an id resolves the ambiguity', mutationsOf(r, 'tasks', 'insert')[0].row.projectId, 'dup-2');

    r = resolveOn(ops, planOf({ type: 'delete_tasks', ids: [lending, 'invented-id'] }));
    check('invented task id → error naming it', !r.ok && r.issues[0].code === 'unknown_task' && /invented-id/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'update_tasks', filter: { project: 'Маркетинг', status: 'done' }, set: { status: 'hold' } }));
    check('filter matching nothing → no_match', !r.ok && r.issues[0].code === 'no_match', messages(r));
    r = resolveOn(ops, planOf({ type: 'update_tasks', filter: { ids: [lending], project: 'KYC' }, set: { status: 'hold' } }));
    check('ids outside the filtered project → no_match', !r.ok && r.issues[0].code === 'no_match', messages(r));
    r = resolveOn(ops, planOf({ type: 'rename_project', project: 'KYC', name: 'KYC' }));
    check('renaming to the same name → nothing_to_do', !r.ok && r.issues[0].code === 'nothing_to_do', messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'x', start: 'today', duration: '9999d' }));
    check('absurd duration rejected', !r.ok && r.issues[0].code === 'bad_token', messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'x', start: '+99999d', duration: '1d' }));
    check('absurd date rejected', !r.ok, messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC2', title: 'x', start: 'today', duration: '1d' }, { type: 'create_task', project: 'Нету', title: 'y', start: 'today', duration: '1d' }));
    eq('every failing action is reported (for a better retry)', r.issues.map(i => i.actionIndex), [0, 1]);
    check('validation issues come through unchanged', (() => { const x = resolveOn(ops, { reply: '', actions: [{ type: 'nope' }] }); return !x.ok && x.issues[0].code === 'unknown_type'; })());

    r = resolveOn(ops, { reply: 'Какие задачи?', actions: [] });
    eq('reply-only plan is fine and changes nothing', [r.ok, r.plan.mutations.length, r.plan.diff.length, r.plan.reply], [true, 0, 0, 'Какие задачи?']);

    r = resolveOn(ops, planOf({ type: 'create_project', name: 'KYC' }));
    eq('duplicate project name is a warning, not an error', [r.ok, r.plan.warnings.map(w => w.code)], [true, ['duplicate_project_name']]);
    r = resolveOn(ops, planOf({ type: 'rename_project', project: 'KYC', name: 'KYC' }, { type: 'create_project', name: 'Ещё' }));
    eq('no-op rename is a warning when the plan still does something', r.plan.warnings.map(w => w.code), ['no_change']);

    // size limit
    const big = new Database(':memory:'); big.exec(TEST_DDL);
    const bigOps = createOps(big);
    bigOps.insert('projects', { id: 'big', name: 'Большой', createdAt: 1 });
    const ins = big.prepare(`INSERT INTO tasks (id, projectId, title, description, startDate, duration, plannedStartDate, plannedDuration, progress, status, steps, taskTypeId) VALUES (?, 'big', ?, '', '2026-10-01', 3, '2026-10-01', 3, 0, 'backlog', '[]', NULL)`);
    big.transaction(() => { for (let i = 0; i < 600; i++) ins.run(`b-${i}`, `T${i}`); })();
    r = resolveOn(bigOps, planOf({ type: 'update_tasks', filter: { project: 'Большой' }, set: { shift: '+1d' } }));
    check('600 mutations → plan_too_large', !r.ok && r.issues[0].code === 'plan_too_large', messages(r));
    r = resolveOn(bigOps, planOf({ type: 'update_tasks', filter: { project: 'Большой', status: 'backlog' }, set: { status: 'backlog' } }));
    check('an update that changes nothing → nothing_to_do', !r.ok && r.issues[0].code === 'nothing_to_do', messages(r));
}

section('resolve: cascades, diff, preconditions');
{
    const { ops } = freshDb();
    const kycTaskIds = fixtures.tasks.filter(t => t.projectId === KYC).map(t => t.id).sort();

    let r = resolveOn(ops, planOf({ type: 'delete_project', project: 'KYC' }));
    const dels = table => r.plan.mutations.filter(m => m.table === table && m.op === 'delete').map(m => m.id).sort();
    eq('delete_project removes its tasks', dels('tasks'), kycTaskIds);
    eq('delete_project removes board links of those tasks', dels('board_tasks'), ['bt-1', 'bt-2']);
    eq('delete_project removes its scoped task types only', dels('task_types'), ['tt-kyc-scoped']);
    eq('delete_project removes the project', dels('projects'), [KYC]);
    eq('the other board link and global types stay', r.plan.mutations.length, 6 + 2 + 1 + 1);
    eq('diff: one project item with cascade counts, tasks not listed one by one', r.plan.diff.map(d => [d.entity, d.op, d.label, d.cascade]), [['project', 'delete', 'KYC', { tasks: 6, boardLinks: 2, taskTypes: 1 }]]);
    eq('affectedTaskIds include cascade-deleted tasks (for the unsaved-form check)', [...r.plan.affectedTaskIds].sort(), kycTaskIds);
    eq('affectedProjectIds', r.plan.affectedProjectIds, [KYC]);
    check('every mutated row has a precondition with its original state', r.plan.mutations.every(m => r.plan.preconditions.some(p => p.table === m.table && p.id === (m.id ?? m.row.id))));
    eq('preconditions hold the original rows', r.plan.preconditions.find(p => p.table === 'projects').row, { id: KYC, name: 'KYC', createdAt: 1 });

    r = resolveOn(ops, planOf({ type: 'delete_tasks', ids: [fixtures.byTitle('Проверка паспортов').id] }));
    eq('delete_tasks also removes the task\'s board link', r.plan.mutations.map(m => `${m.op}:${m.table}`).sort(), ['delete:board_tasks', 'delete:tasks']);
    eq('diff for a task delete', r.plan.diff.map(d => [d.entity, d.op, d.label, d.projectName]), [['task', 'delete', 'Проверка паспортов', 'KYC']]);

    r = resolveOn(ops, planOf({ type: 'update_tasks', filter: { project: 'KYC', status: 'progress' }, set: { shift: '+1w', status: 'hold' } }));
    eq('update mutations carry only changed columns', r.plan.mutations.every(m => m.op === 'update' && Object.keys(m.patch).sort().join() === 'startDate,status'), true);
    const d0 = r.plan.diff[0];
    eq('update diff shows from → to', [d0.entity, d0.op, d0.projectName, d0.changes.map(c => [c.field, c.from, c.to])],
        ['task', 'update', 'KYC', [['startDate', '2026-10-05', '2026-10-12'], ['status', 'progress', 'hold']]]);

    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Новая', start: 'today', duration: '7d', steps: ['а'] }));
    eq('create diff', [r.plan.diff[0].op, r.plan.diff[0].label, r.plan.diff[0].projectName, r.plan.diff[0].changes.map(c => c.field)], ['create', 'Новая', 'KYC', ['status', 'plannedStartDate', 'plannedDuration', 'progress', 'description', 'steps']]);
    check('a create_task depends on its parent project being unchanged', r.plan.preconditions.some(p => p.table === 'projects' && p.id === KYC && p.row?.name === 'KYC'));
    check('a new row has a null precondition (its id must be free)', r.plan.preconditions.some(p => p.table === 'tasks' && p.row === null));

    const a = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Н', start: 'today', duration: '7d' }));
    const b = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Н', start: 'today', duration: '7d' }));
    eq('resolution is deterministic', JSON.stringify(a.plan), JSON.stringify(b.plan));
    eq('resolution never writes', JSON.stringify(read.listProjects(ops).map(p => p.taskCount)), JSON.stringify([6, 4, 2, 2]));
    eq('KYC Legacy is untouched by a KYC delete', r.plan.mutations.some(m => m.id === LEGACY), false);
}

// ==== execute / undo / store ============================================================================
const { executePlan, undoLastPlan, describeUndo, countEntries } = await import('../src/features/ai/actions/execute.ts');
const { createFileUndoStore } = await import('../src/features/ai/actions/undoStore.ts');


/** Counts as the user will see them, computed from a resolved plan without executing it. */
function countEntriesOf(sqlite, plan) {
    const ops = createOps(sqlite);
    const entries = plan.mutations.map(m => {
        const id = m.op === 'insert' ? m.row.id : m.id;
        const before = ops.get(m.table, id);
        const after = m.op === 'insert' ? m.row : m.op === 'delete' ? null : { ...before, ...m.patch };
        return { table: m.table, id, label: '', before, after };
    });
    return countEntries(entries, false);
}

const tmpRoot = fs.mkdtempSync(path.join(os.tmpdir(), 'deckify-ai-actions-'));
let fileN = 0;
const newStore = () => createFileUndoStore(fs, path.join(tmpRoot, `undo-${++fileN}.json`));
const depsFor = (sqlite, store, extra = {}) => {
    const ops = createOps(sqlite);
    return { run: fn => sqlite.transaction(() => fn(ops))(), undoStore: store, dbPath: '/test/deckify.db', ...extra };
};
const resolveOk = (ops, plan) => { const r = resolveOn(ops, plan); if (!r.ok) throw new Error(`resolve failed: ${messages(r)}`); return r.plan; };
const countBy = (sqlite, table) => sqlite.prepare(`SELECT COUNT(*) c FROM ${table}`).get().c;

section('execute + undo: every gold plan round-trips byte-identically');
{
    for (const c of cases) {
        const { sqlite, ops } = freshDb();
        const store = newStore();
        const deps = depsFor(sqlite, store);
        const before = dump(sqlite);
        const plan = resolveOk(ops, c.gold);
        const result = executePlan(plan, deps);
        check(`executes: ${c.id}`, result.ok, JSON.stringify(result));
        if (plan.mutations.length === 0) {
            eq(`reply-only plan changes nothing and writes no undo record: ${c.id}`, [dump(sqlite) === before, result.undo, store.read()], [true, 'none', null]);
            continue;
        }
        check(`data changed: ${c.id}`, dump(sqlite) !== before);
        eq(`undo record saved: ${c.id}`, result.undo, 'saved');
        const undone = undoLastPlan(deps);
        check(`undo ok: ${c.id}`, undone.ok, JSON.stringify(undone));
        check(`undo restores a byte-identical database: ${c.id}`, dump(sqlite) === before);
        eq(`undo record cleared: ${c.id}`, store.read(), null);
    }
}

section('execute: results and counts');
{
    const { sqlite, ops } = freshDb();
    const deps = depsFor(sqlite, newStore());
    let r = executePlan(resolveOk(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Н', start: 'today', duration: '3d' })), deps);
    eq('create → counts', [r.ok, r.counts], [true, { created: 1, updated: 0, deleted: 0 }]);
    eq('the new task exists with UI-parity fields', sqlite.prepare(`SELECT title, startDate, duration, plannedStartDate, plannedDuration FROM tasks WHERE title = 'Н'`).get(),
        { title: 'Н', startDate: '', duration: 0, plannedStartDate: '2026-10-13', plannedDuration: 3 });
    r = executePlan(resolveOk(ops, planOf({ type: 'update_tasks', filter: { project: 'KYC', status: 'progress' }, set: { shift: '+1w' } })), deps);
    eq('bulk update → counts', r.counts, { created: 0, updated: 3, deleted: 0 });
    eq('shifted starts', sqlite.prepare(`SELECT startDate FROM tasks WHERE projectId = ? AND status = 'progress' ORDER BY startDate`).all(KYC).map(t => t.startDate), ['2026-10-05', '2026-10-12', '2026-10-15']);
    r = executePlan(resolveOk(ops, planOf({ type: 'delete_project', project: 'KYC' })), deps);
    eq('delete project → counts include its tasks (7 tasks incl. the new one + project)', r.counts, { created: 0, updated: 0, deleted: 8 });
    eq('rows gone', [countBy(sqlite, 'projects'), sqlite.prepare(`SELECT COUNT(*) c FROM tasks WHERE projectId = ?`).get(KYC).c, countBy(sqlite, 'board_tasks'), sqlite.prepare(`SELECT COUNT(*) c FROM task_types WHERE projectId = ?`).get(KYC).c], [3, 0, 1, 0]);
}

section('execute: stale previews and atomicity');
{
    let { sqlite, ops } = freshDb();
    let deps = depsFor(sqlite, newStore());
    const passports = fixtures.byTitle('Проверка паспортов').id;
    let plan = resolveOk(ops, planOf({ type: 'update_tasks', filter: { ids: [passports] }, set: { shift: '+1w' } }));
    sqlite.prepare(`UPDATE tasks SET title = 'Изменено вручную' WHERE id = ?`).run(passports);
    let before = dump(sqlite);
    let r = executePlan(plan, deps);
    eq('row edited after the preview → stale', [r.ok, r.reason, r.stale?.map(s => s.label)], [false, 'stale', ['Изменено вручную']]);
    eq('stale plan changed nothing and left no undo record', [dump(sqlite) === before, deps.undoStore.read()], [true, null]);

    ({ sqlite, ops } = freshDb()); deps = depsFor(sqlite, newStore());
    plan = resolveOk(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Х', start: 'today', duration: '1d' }));
    sqlite.prepare(`DELETE FROM projects WHERE id = ?`).run(KYC);
    before = dump(sqlite);
    r = executePlan(plan, deps);
    eq('parent project deleted after the preview → stale, no orphan task', [r.reason, dump(sqlite) === before], ['stale', true]);

    ({ sqlite, ops } = freshDb()); deps = depsFor(sqlite, newStore());
    plan = resolveOk(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Х', start: 'today', duration: '1d' }));
    sqlite.prepare(`INSERT INTO tasks (id, projectId, title) VALUES ('new-1', ?, 'занял id')`).run(KYC);
    before = dump(sqlite);
    r = executePlan(plan, deps);
    eq('a colliding new id → stale', [r.reason, dump(sqlite) === before], ['stale', true]);

    // a failure in the middle of a plan rolls everything back
    ({ sqlite, ops } = freshDb()); deps = depsFor(sqlite, newStore());
    before = dump(sqlite);
    const broken = { id: 'p-x', createdAt: 1, today: TODAY, reply: '', diff: [], warnings: [], affectedTaskIds: [], affectedProjectIds: [], preconditions: [],
        mutations: [
            { op: 'update', table: 'projects', id: KYC, patch: { name: 'Переименован' } },
            { op: 'insert', table: 'tasks', row: { id: 'ok-1', projectId: KYC, title: 'создана' } },
            { op: 'insert', table: 'tasks', row: { id: 'bad-1', projectId: KYC, nonexistent_column: 1 } },
        ] };
    r = executePlan(broken, deps);
    eq('a failing mutation → error, nothing applied, no undo record', [r.ok, r.reason, dump(sqlite) === before, deps.undoStore.read()], [false, 'error', true, null]);

    // undo record cannot be written: data stays applied, caller is told
    ({ sqlite, ops } = freshDb());
    deps = depsFor(sqlite, { read: () => null, write: () => { throw new Error('disk full'); }, clear: () => {} });
    r = executePlan(resolveOk(ops, planOf({ type: 'create_project', name: 'Новый' })), deps);
    eq('undo write failure → plan stays applied, undo:failed', [r.ok, r.undo, r.undoError, countBy(sqlite, 'projects')], [true, 'failed', 'disk full', 5]);
}

section('undo: last plan only, conflicts, persistence');
{
    const { sqlite, ops } = freshDb();
    const store = newStore();
    const deps = depsFor(sqlite, store);
    const kycTask = fixtures.byTitle('Верификация адреса').id;

    check('nothing to undo at the start', undoLastPlan(deps).reason === 'none');

    executePlan(resolveOk(ops, planOf({ type: 'create_project', name: 'План A' })), deps);
    const afterA = dump(sqlite);
    executePlan(resolveOk(ops, planOf({ type: 'update_tasks', filter: { ids: [kycTask] }, set: { status: 'done' } })), deps);
    const afterB = dump(sqlite);
    check('plans A and B both changed data', afterA !== afterB);

    const info = describeUndo(store, deps.dbPath);
    eq('describeUndo reports the LAST plan (B) only', [info.available, info.summary?.map(x => `${x.op} ${x.entity} ${x.label}`)], [true, ['update task Верификация адреса']]);
    check('describeUndo: createdAt is a number', typeof info.createdAt === 'number');

    // the file is human-readable and contains only the touched rows
    const file = JSON.parse(fs.readFileSync(path.join(tmpRoot, `undo-${fileN}.json`), 'utf8'));
    eq('record: version, dbPath, one entry', [file.version, file.dbPath, file.entries.length], [1, '/test/deckify.db', 1]);
    eq('record: before/after are the real rows', [file.entries[0].before.status, file.entries[0].after.status, file.entries[0].after.progress], ['progress', 'done', 100]);
    check('no temp file left behind', !fs.readdirSync(tmpRoot).some(f => f.endsWith('.tmp')));

    // restart: a new store instance on the same file
    const restarted = depsFor(sqlite, createFileUndoStore(fs, path.join(tmpRoot, `undo-${fileN}.json`)));
    const undone = undoLastPlan(restarted);
    check('undo works from a fresh store instance (survives a restart)', undone.ok && dump(sqlite) === afterA, JSON.stringify(undone));
    eq('undo reports what it restored', undone.restored, { created: 0, updated: 1, deleted: 0 });
    check('undo reports the id of the plan it reverted', typeof undone.planId === 'string' && undone.planId.length > 0);
    eq('undo reports the touched rows and none removed (an update)', [undone.touched.map(t => [t.table, t.id, t.label]), undone.removed], [[['tasks', kycTask, 'Верификация адреса']], []]);
    {
        const c = freshDb(); const cd = depsFor(c.sqlite, newStore());
        executePlan(resolveOk(c.ops, planOf({ type: 'create_task', project: 'KYC', title: 'Новая', start: 'today', duration: '1d' })), cd);
        const u = undoLastPlan(cd);
        eq('undoing a creation reports the removed row (the UI closes its editor)', [u.ok, u.removed.map(r => [r.table, r.label])], [true, [['tasks', 'Новая']]]);
    }
    eq('only the last plan is undoable: a second undo has nothing to do', undoLastPlan(deps).reason, 'none');
    check('plan A is still applied', dump(sqlite) === afterA);
}
{
    const { sqlite, ops } = freshDb();
    const store = newStore();
    const deps = depsFor(sqlite, store);
    const t = fixtures.byTitle('Лендинг').id;

    executePlan(resolveOk(ops, planOf({ type: 'update_tasks', filter: { ids: [t] }, set: { shift: '+1w' } })), deps);
    sqlite.prepare(`UPDATE tasks SET title = 'Правка пользователя' WHERE id = ?`).run(t);
    const before = dump(sqlite);
    let r = undoLastPlan(deps);
    eq('manual edit after the plan → undo blocked, entity listed', [r.ok, r.reason, r.conflicts?.map(c => c.label)], [false, 'conflict', ['Правка пользователя']]);
    eq('blocked undo changed nothing and kept the record', [dump(sqlite) === before, store.read() !== null], [true, true]);

    // created row deleted by hand / deleted row recreated by hand
    const s2 = freshDb(); const d2 = depsFor(s2.sqlite, newStore());
    executePlan(resolveOk(s2.ops, planOf({ type: 'create_project', name: 'Временный' })), d2);
    s2.sqlite.prepare(`DELETE FROM projects WHERE name = 'Временный'`).run();
    eq('created row removed by hand → conflict', undoLastPlan(d2).reason, 'conflict');

    const s3 = freshDb(); const d3 = depsFor(s3.sqlite, newStore());
    executePlan(resolveOk(s3.ops, planOf({ type: 'delete_tasks', ids: [t] })), d3);
    s3.sqlite.prepare(`INSERT INTO tasks (id, projectId, title) VALUES (?, ?, 'занял место')`).run(t, MARKETING);
    eq('deleted row recreated by hand → conflict', undoLastPlan(d3).reason, 'conflict');

    // another process (MCP) writing between preview and confirm, on a real WAL file
    const dbFile = path.join(tmpRoot, 'concurrent.db');
    const a = new Database(dbFile); a.pragma('journal_mode = WAL'); a.pragma('busy_timeout = 5000'); a.exec(TEST_DDL);
    const opsA = createOps(a);
    opsA.insert('projects', { id: 'p1', name: 'P', createdAt: 1 });
    opsA.insert('tasks', { id: 't1', projectId: 'p1', title: 'T', description: '', startDate: '2026-10-01', duration: 5, plannedStartDate: '2026-10-01', plannedDuration: 5, progress: 0, status: 'backlog', steps: '[]', taskTypeId: null });
    const plan = resolveOk(opsA, planOf({ type: 'update_tasks', filter: { ids: ['t1'] }, set: { shift: '+1d' } }));
    const b = new Database(dbFile); b.pragma('busy_timeout = 5000');
    b.prepare(`UPDATE tasks SET status = 'hold' WHERE id = 't1'`).run(); b.close();
    r = executePlan(plan, depsFor(a, newStore()));
    eq('a second connection (MCP) writing between preview and confirm → stale', [r.ok, r.reason], [false, 'stale']);
    a.close();
}

section('undo store: validation');
{
    const file = path.join(tmpRoot, 'store-checks.json');
    const store = createFileUndoStore(fs, file);
    eq('missing file → null', store.read(), null);
    store.clear();
    check('clear on a missing file does not throw', true);

    const good = { version: 1, planId: 'p', createdAt: 1, dbPath: '/x.db', summary: [], entries: [{ table: 'tasks', id: 't', label: 'L', before: null, after: { id: 't' } }] };
    store.write(good);
    eq('write → read round trip', store.read(), good);
    store.write({ ...good, planId: 'second' });
    eq('write replaces the previous record', store.read().planId, 'second');

    for (const [name, content] of [
        ['garbage', 'not json at all'],
        ['wrong version', JSON.stringify({ ...good, version: 2 })],
        ['missing dbPath', JSON.stringify({ ...good, dbPath: undefined })],
        ['entries not an array', JSON.stringify({ ...good, entries: {} })],
        ['entry with an unknown table', JSON.stringify({ ...good, entries: [{ ...good.entries[0], table: 'users' }] })],
        ['entry with a non-object row', JSON.stringify({ ...good, entries: [{ ...good.entries[0], after: 5 }] })],
        ['an array instead of an object', '[]'],
    ]) {
        fs.writeFileSync(file, content);
        eq(`corrupt record (${name}) → 'corrupt'`, store.read(), 'corrupt');
    }
    check('a corrupt file is kept for inspection, not deleted', fs.existsSync(file));
    const deps = depsFor(freshDb().sqlite, store);
    eq('undo with a corrupt file → corrupt, data untouched', undoLastPlan(deps).reason, 'corrupt');
    eq('describeUndo flags corruption', describeUndo(store, deps.dbPath), { available: false, corrupt: true });

    store.write({ ...good, dbPath: '/another/deckify.db' });
    eq('a record for another database is ignored', [undoLastPlan(deps).reason, describeUndo(store, deps.dbPath).available], ['none', false]);
    store.clear();
    eq('clear removes the file', fs.existsSync(file), false);
}

// ==== Phase 5: boards and task types ===================================================================
const { actionCases } = await import('./ai-cases-phase5.mjs');
const BOARD = fixtures.boards[0].id;
const [DEV, APPROVAL] = fixtures.taskTypes.map(t => t.id);
const T = title => fixtures.byTitle(title).id;

section('phase 5: validation');
{
    const codes = plan => { const r = validatePlan(plan); return r.ok ? ['ok'] : r.issues.map(i => i.code); };
    const one = a => ({ reply: '', actions: [a] });
    const F = { project: 'KYC' };
    const valid = [
        { type: 'create_board', name: 'Релиз' }, { type: 'rename_board', board: 'А', name: 'Б' }, { type: 'delete_board', board: 'А' },
        { type: 'add_to_board', board: 'А', filter: F }, { type: 'remove_from_board', board: 'А', filter: { ids: ['x'] } },
        { type: 'create_task_type', name: 'Дизайн' }, { type: 'create_task_type', name: 'Дизайн', color: '#ff0000', project: 'KYC' }, { type: 'create_task_type', name: 'Д', color: '#ABCDEF' },
        { type: 'update_task_type', taskType: 'Т', name: 'Н' }, { type: 'update_task_type', taskType: 'Т', color: '#00ff00' }, { type: 'update_task_type', taskType: 'Т', global: true },
        { type: 'update_task_type', taskType: 'Т', name: 'Н', global: false },
        { type: 'delete_task_type', taskType: 'Т' }, { type: 'set_task_type', filter: F, taskType: 'Т' }, { type: 'set_task_type', filter: F, taskType: 'none' },
        { type: 'create_task', project: 'KYC', title: 'x', start: 'today', duration: '1d', taskType: 'Т' },
    ];
    for (const a of valid) eq(`valid: ${a.type}${a.global === false ? ' (global:false is a filler)' : ''}${a.taskType && a.type === 'create_task' ? ' + taskType' : ''}`, codes(one(a)), ['ok']);
    eq('create_board needs a name', codes(one({ type: 'create_board' })), ['missing_field']);
    eq('rename_board needs both', codes(one({ type: 'rename_board', board: 'А' })), ['missing_field']);
    eq('add_to_board needs a board', codes(one({ type: 'add_to_board', filter: F })), ['missing_field']);
    eq('add_to_board needs a non-empty filter', codes(one({ type: 'add_to_board', board: 'А', filter: {} })), ['empty_filter']);
    eq('remove_from_board filter keys are checked', codes(one({ type: 'remove_from_board', board: 'А', filter: { id: 'x' } })), ['unknown_field']);
    eq('colour names are not hex', codes(one({ type: 'create_task_type', name: 'Д', color: 'red' })), ['bad_token']);
    eq('five hex digits', codes(one({ type: 'create_task_type', name: 'Д', color: '#12345' })), ['bad_token']);
    eq('update_task_type with nothing to change', codes(one({ type: 'update_task_type', taskType: 'Т' })), ['empty_set']);
    eq('global:false alone is "nothing"', codes(one({ type: 'update_task_type', taskType: 'Т', global: false })), ['empty_set']);
    eq('global must be a boolean', codes(one({ type: 'update_task_type', taskType: 'Т', global: 'yes' })), ['bad_type']);
    eq('set_task_type needs taskType', codes(one({ type: 'set_task_type', filter: F })), ['missing_field']);
    eq('set_task_type needs a filter', codes(one({ type: 'set_task_type', taskType: 'Т' })), ['empty_filter']);
    eq('create_task taskType must be a string', codes(one({ type: 'create_task', project: 'KYC', title: 'x', start: 'today', duration: '1d', taskType: 5 })), ['bad_type']);
    const unknown = validatePlan(one({ type: 'create_boards' }));
    check('the unknown-type message lists the new actions', !unknown.ok && /create_board.*set_task_type/.test(unknown.issues[0].message));
}

section('phase 5: gold plans (12 cases) resolve, execute and undo byte-identically');
for (const c of actionCases) {
    const { sqlite, ops } = freshDb();
    const r = resolveOn(ops, c.gold);
    if (!r.ok) { check(`resolves: ${c.id}`, false, messages(r)); continue; }
    const problems = matchExpected(r.plan, c);
    check(`resolves to the expected effects: ${c.id}`, problems.length === 0, problems.join('; '));
    const deps = depsFor(sqlite, newStore());
    const before = dump(sqlite);
    const done = executePlan(r.plan, deps);
    check(`executes and changes data: ${c.id}`, done.ok && dump(sqlite) !== before, JSON.stringify(done));
    const undone = undoLastPlan(deps);
    check(`undo restores a byte-identical database: ${c.id}`, undone.ok && dump(sqlite) === before, JSON.stringify(undone));
}

section('phase 5: boards');
{
    const { sqlite, ops } = freshDb();
    let r = resolveOn(ops, actionCases[0].gold);
    const links = mutationsOf(r, 'board_tasks', 'insert');
    eq('PRD example: four new links, two tasks were already on the board', [links.length, r.plan.warnings.map(w => w.code), /2 из 6/.test(r.plan.warnings[0].message)], [4, ['already_on_board'], true]);
    eq('the warning carries the numbers for the localized text', r.plan.warnings[0].params, { count: 2, total: 6, board: 'Спринт 5' });
    eq('link rows follow the UI rules {id, boardId, taskId, addedAt: now}', links[0].row, { id: 'new-1', boardId: BOARD, taskId: links[0].row.taskId, addedAt: 1_700_000_000_000 });
    check('every selected task and the board are preconditions (a vanished task must not leave a dangling link)',
        r.plan.preconditions.some(p => p.table === 'boards' && p.id === BOARD) && links.every(l => r.plan.preconditions.some(p => p.table === 'tasks' && p.id === l.row.taskId)));
    const linkItems = r.plan.diff.filter(d => d.changes.some(c => c.field === 'board'));
    eq('diff: the link is a "board" change on the task item', [linkItems.length, linkItems[0].entity, linkItems[0].op, linkItems[0].changes], [4, 'task', 'update', [{ field: 'board', from: null, to: 'Спринт 5' }]]);
    eq('result counts: four links, nothing else', countEntriesOf(sqlite, r.plan), { created: 0, updated: 0, deleted: 0, linked: 4 });

    r = resolveOn(ops, planOf(
        { type: 'add_to_board', board: 'Спринт 5', filter: { project: 'KYC' } },
        { type: 'add_to_board', board: 'Спринт 5', filter: { project: 'KYC', status: 'backlog' } },
    ));
    eq('overlapping add_to_board actions never create a duplicate link', [r.ok, mutationsOf(r, 'board_tasks', 'insert').length, r.plan.warnings.length], [true, 4, 2]);
    r = resolveOn(ops, planOf({ type: 'add_to_board', board: 'Спринт 5', filter: { ids: [T('Проверка паспортов'), T('Экран логина')] } }));
    check('everything already on the board → one clear error naming why', !r.ok && r.issues[0].code === 'nothing_to_do' && /уже есть в доске «Спринт 5»/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'remove_from_board', board: 'Спринт 5', filter: { ids: [T('Скоринг клиентов')] } }));
    check('removing a task that is not on the board → nothing_to_do with the reason', !r.ok && /нет в доске/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'remove_from_board', board: 'Спринт 5', filter: { ids: [T('Скоринг клиентов'), T('Экран логина')] } }));
    eq('partly present: removes the present one, warns about the other', [mutationsOf(r, 'board_tasks', 'delete').length, r.plan.warnings.map(w => w.code)], [1, ['not_on_board']]);

    r = resolveOn(ops, planOf({ type: 'create_board', name: 'Новая' }, { type: 'add_to_board', board: 'новая', filter: { ids: [T('Лендинг')] } }));
    eq('a board created earlier in the plan can be filled by name', [r.ok, mutationsOf(r, 'boards', 'insert').length, mutationsOf(r, 'board_tasks', 'insert')[0].row.boardId === mutationsOf(r, 'boards', 'insert')[0].row.id], [true, 1, true]);
    r = resolveOn(ops, planOf({ type: 'create_board', name: 'спринт 5' }));
    eq('duplicate board name is a warning', [r.ok, r.plan.warnings.map(w => w.code)], [true, ['duplicate_board_name']]);
    r = resolveOn(ops, planOf({ type: 'rename_board', board: 'Спринт 5', name: 'Спринт 5' }));
    check('renaming to the same name changes nothing', !r.ok && r.issues[0].code === 'nothing_to_do', messages(r));
    r = resolveOn(ops, planOf({ type: 'delete_board', board: 'Спринт 6' }));
    check('unknown board → Russian message with the available names', !r.ok && r.issues[0].code === 'unknown_board' && /доска «Спринт 6» не найдена/.test(r.issues[0].message) && /Спринт 5/.test(r.issues[0].message), messages(r));

    r = resolveOn(ops, planOf({ type: 'delete_board', board: 'Спринт 5' }));
    eq('delete_board: links go, tasks stay', [mutationsOf(r, 'board_tasks', 'delete').length, mutationsOf(r, 'boards', 'delete').length, r.plan.mutations.some(m => m.table === 'tasks'), r.plan.affectedTaskIds], [3, 1, false, []]);
    eq('diff: one board item with the link count', r.plan.diff.map(d => [d.entity, d.op, d.label, d.cascade]), [['board', 'delete', 'Спринт 5', { boardLinks: 3 }]]);
    eq('result counts: one board, no "unlinked"', countEntriesOf(sqlite, r.plan), { created: 0, updated: 0, deleted: 1 });

    sqlite.prepare(`INSERT INTO boards (id, name, createdAt) VALUES ('b-dup', 'Спринт 5', 9)`).run();
    r = resolveOn(ops, planOf({ type: 'delete_board', board: 'Спринт 5' }));
    check('two boards with the same name → ambiguous_board listing both ids', !r.ok && r.issues[0].code === 'ambiguous_board' && r.issues[0].message.includes('b-dup') && r.issues[0].message.includes(BOARD), messages(r));
    r = resolveOn(ops, planOf({ type: 'delete_board', board: 'b-dup' }));
    eq('an id resolves the ambiguity', r.ok && r.plan.diff[0].id, 'b-dup');
}
{
    // races between preview and confirmation
    const { sqlite, ops } = freshDb();
    const deps = depsFor(sqlite, newStore());
    let plan = resolveOk(ops, planOf({ type: 'add_to_board', board: 'Спринт 5', filter: { ids: [T('Скоринг клиентов')] } }));
    sqlite.prepare(`INSERT INTO board_tasks (id, boardId, taskId, addedAt) VALUES ('other-link', ?, ?, 1)`).run(BOARD, T('Скоринг клиентов'));
    let before = dump(sqlite);
    let r = executePlan(plan, deps);
    eq('the same task linked by someone else meanwhile (UNIQUE) → stale, nothing applied', [r.ok, r.reason, dump(sqlite) === before], [false, 'stale', true]);

    plan = resolveOk(ops, planOf({ type: 'add_to_board', board: 'Спринт 5', filter: { ids: [T('Лендинг')] } }));
    sqlite.prepare(`DELETE FROM boards WHERE id = ?`).run(BOARD);
    before = dump(sqlite);
    r = executePlan(plan, deps);
    eq('the board deleted meanwhile → stale, no dangling link', [r.reason, dump(sqlite) === before], ['stale', true]);

    const f = freshDb(); const d2 = depsFor(f.sqlite, newStore());
    plan = resolveOk(f.ops, planOf({ type: 'add_to_board', board: 'Спринт 5', filter: { ids: [T('Лендинг')] } }));
    f.sqlite.prepare(`DELETE FROM tasks WHERE id = ?`).run(T('Лендинг'));
    before = dump(f.sqlite);
    r = executePlan(plan, d2);
    eq('the task deleted meanwhile → stale', [r.reason, dump(f.sqlite) === before], ['stale', true]);
}

section('phase 5: task types');
{
    const { sqlite, ops } = freshDb();
    let r = resolveOn(ops, planOf({ type: 'create_task_type', name: 'Дизайн' }));
    eq('global type with the UI default colour', mutationsOf(r, 'task_types', 'insert')[0].row, { id: 'new-1', projectId: null, name: 'Дизайн', color: '#4F46E5' });
    r = resolveOn(ops, planOf({ type: 'create_task_type', name: ' Дизайн ', color: '#EF4444', project: 'KYC' }));
    eq('type scoped to a project', mutationsOf(r, 'task_types', 'insert')[0].row, { id: 'new-1', projectId: KYC, name: 'Дизайн', color: '#EF4444' });
    eq('diff for a scoped type', r.plan.diff.map(d => [d.entity, d.op, d.label, d.changes]), [['task_type', 'create', 'Дизайн', [{ field: 'color', from: null, to: '#EF4444' }, { field: 'scope', from: null, to: 'KYC' }]]]);
    r = resolveOn(ops, planOf({ type: 'create_task_type', name: 'разработка' }));
    eq('same name in the same scope is a warning', r.plan.warnings.map(w => w.code), ['duplicate_task_type_name']);
    r = resolveOn(ops, planOf({ type: 'create_task_type', name: 'Разработка', project: 'KYC' }));
    eq('same name in another scope is fine', r.plan.warnings.length, 0);
    r = resolveOn(ops, planOf({ type: 'create_task_type', name: 'X', project: 'Нет такого' }));
    check('unknown project for a type', !r.ok && r.issues[0].code === 'unknown_project', messages(r));

    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: 'Согласование', name: 'Ревью', color: '#00ff00' }));
    eq('rename + recolour patch', mutationsOf(r, 'task_types', 'update')[0].patch, { name: 'Ревью', color: '#00ff00' });
    eq('diff shows from → to', r.plan.diff[0].changes, [{ field: 'name', from: 'Согласование', to: 'Ревью' }, { field: 'color', from: '#f59e0b', to: '#00ff00' }]);
    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: 'Согласование', color: '#F59E0B' }));
    check('the same colour in another case is no change', !r.ok && r.issues[0].code === 'nothing_to_do', messages(r));
    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: 'KYC-only', global: true }));
    eq('make global sets projectId to NULL; diff says the scope changed', [mutationsOf(r, 'task_types', 'update')[0].patch, r.plan.diff[0].changes], [{ projectId: null }, [{ field: 'scope', from: 'KYC', to: null }]]);
    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: 'Разработка', global: true }));
    check('making a global type global is a no-op', !r.ok && /уже общий/.test(messages(r)), messages(r));

    r = resolveOn(ops, planOf({ type: 'delete_task_type', taskType: 'Согласование' }));
    eq('delete type: the type goes, its users lose it (updated, not deleted)', [mutationsOf(r, 'task_types', 'delete').length, r.plan.mutations.filter(m => m.table === 'tasks').map(m => [m.op, m.patch])], [1, [['update', { taskTypeId: null }]]]);
    eq('diff: one type item summarising the unassigned tasks', r.plan.diff.map(d => [d.entity, d.op, d.label, d.cascade]), [['task_type', 'delete', 'Согласование', { unassignedTasks: 1 }]]);
    eq('the affected task is reported (an open form must reload)', r.plan.affectedTaskIds, [T('Экран логина')]);
    eq('counts: one type deleted, one task updated', countEntriesOf(sqlite, r.plan), { created: 0, updated: 1, deleted: 1 });

    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'KYC', status: 'progress' }, taskType: 'Разработка' }));
    eq('set_task_type by name on a project filter', r.plan.mutations.map(m => m.patch.taskTypeId), [DEV, DEV, DEV]);
    eq('diff names the types', r.plan.diff[0].changes, [{ field: 'taskType', from: null, to: 'Разработка' }]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { ids: [T('Экран логина')] }, taskType: DEV }));
    eq('by id; diff shows the old type', r.plan.diff[0].changes, [{ field: 'taskType', from: 'Согласование', to: 'Разработка' }]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { ids: [T('Экран логина')] }, taskType: 'NONE' }));
    eq('"none" clears (any case)', [mutationsOf(r, 'tasks', 'update')[0].patch, r.plan.diff[0].changes], [{ taskTypeId: null }, [{ field: 'taskType', from: 'Согласование', to: null }]]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { ids: [T('Проверка паспортов')] }, taskType: 'none' }));
    check('clearing a task that has no type changes nothing', !r.ok && r.issues[0].code === 'nothing_to_do', messages(r));
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'KYC' }, taskType: 'KYC-only' }));
    eq('a type scoped to the project fits its tasks', [r.ok, r.plan.mutations.length], [true, 6]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'Маркетинг' }, taskType: 'tt-kyc-scoped' }));
    check('a type scoped to another project is refused with both named', !r.ok && r.issues[0].code === 'type_scope' && /проект «KYC»/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'Маркетинг', title: 'x', start: 'today', duration: '1d', taskType: 'tt-kyc-scoped' }));
    check('create_task refuses a type scoped to another project (even by id)', !r.ok && r.issues[0].code === 'type_scope' && /проект «KYC»/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'x', start: 'today', duration: '1d', taskType: 'tt-kyc-scoped' }));
    eq('create_task accepts a type scoped to its own project', [r.ok, r.ok && r.plan.mutations[0].row.taskTypeId], [true, 'tt-kyc-scoped']);
    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: DEV, global: true }));
    check('making a global type global gives exactly one "already global" warning', !r.ok && r.issues[0].code === 'nothing_to_do' && (r.issues[0].message.match(/Действие 1/g) ?? []).length === 1 && /уже общий/.test(r.issues[0].message), messages(r));
    r = resolveOn(ops, planOf({ type: 'update_task_type', taskType: DEV, global: true, name: 'Разработка' }));
    check('global + unchanged name → one warning, not two', !r.ok && (r.issues[0].message.match(/Действие 1/g) ?? []).length === 1, messages(r));
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { ids: [T('Лендинг')] }, taskType: 'KYC-only' }));
    check('by name, a type of another project is simply not visible', !r.ok && r.issues[0].code === 'unknown_task_type', messages(r));

    sqlite.prepare(`INSERT INTO task_types (id, projectId, name, color) VALUES ('tt-dup', ?, 'Разработка', '#000000')`).run(KYC);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'KYC' }, taskType: 'Разработка' }));
    check('global + scoped with the same name in one project → ambiguous with scopes', !r.ok && r.issues[0].code === 'ambiguous_task_type' && /общий/.test(r.issues[0].message) && /проект «KYC»/.test(r.issues[0].message) && r.issues[0].message.includes('tt-dup'), messages(r));
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'Маркетинг' }, taskType: 'Разработка' }));
    eq('…but another project only sees the global one', [r.ok, r.plan.mutations[0].patch.taskTypeId], [true, DEV]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'KYC' }, taskType: 'tt-dup' }));
    eq('an id resolves it', r.ok && r.plan.mutations[0].patch.taskTypeId, 'tt-dup');

    r = resolveOn(ops, planOf({ type: 'create_task', project: 'Мобильное приложение', title: 'Т', start: 'today', duration: '1d', taskType: 'Разработка' }));
    eq('create_task with a type; diff has the name', [mutationsOf(r, 'tasks', 'insert')[0].row.taskTypeId, r.plan.diff[0].changes.find(c => c.field === 'taskType')], [DEV, { field: 'taskType', from: null, to: 'Разработка' }]);
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'Мобильное приложение', title: 'Т', start: 'today', duration: '1d', taskType: 'KYC-only' }));
    check('create_task with a type of another project → unknown_task_type', !r.ok && r.issues[0].code === 'unknown_task_type', messages(r));
    r = resolveOn(ops, planOf({ type: 'create_task', project: 'KYC', title: 'Т', start: 'today', duration: '1d', taskType: 'none' }));
    eq('create_task with "none" simply has no type', mutationsOf(r, 'tasks', 'insert')[0].row.taskTypeId, null);
    r = resolveOn(ops, planOf({ type: 'create_task_type', name: 'Новый', color: '#123456' }, { type: 'set_task_type', filter: { ids: [T('Лендинг')] }, taskType: 'новый' }));
    eq('a type created earlier in the plan can be assigned by name', [r.ok, mutationsOf(r, 'tasks', 'update')[0].patch.taskTypeId === mutationsOf(r, 'task_types', 'insert')[0].row.id], [true, true]);
    r = resolveOn(ops, planOf({ type: 'set_task_type', filter: { project: 'KYC', status: 'progress' }, taskType: DEV }, { type: 'add_to_board', board: 'Спринт 5', filter: { project: 'KYC', status: 'progress' } }));
    check('type + board in one plan resolves', r.ok, r.ok ? '' : messages(r));
    const merged = r.plan.diff.find(d => d.id === T('Верификация адреса'));
    eq('one diff item per task, with both changes merged', [r.plan.diff.filter(d => d.id === T('Верификация адреса')).length, merged.changes.map(c => c.field)], [1, ['taskType', 'board']]);

    r = resolveOn(ops, planOf({ type: 'delete_project', project: 'KYC' }));
    check('deleting a project does not list its scoped types as separate items', !r.plan.diff.some(d => d.entity === 'task_type'), JSON.stringify(r.plan.diff.map(d => d.entity)));
    r = resolveOn(ops, planOf({ type: 'delete_task_type', taskType: 'KYC-only' }, { type: 'delete_project', project: 'KYC' }));
    check('a type deleted and then its project in one plan resolves', r.ok, r.ok ? '' : messages(r));
}
{
    // counts through execute / undo, including links that are NOT cascades
    const { sqlite, ops } = freshDb();
    const deps = depsFor(sqlite, newStore());
    let res = executePlan(resolveOk(ops, planOf({ type: 'add_to_board', board: 'Спринт 5', filter: { ids: [T('Скоринг клиентов'), T('Лендинг')] } })), deps);
    eq('execute: two links added', res.counts, { created: 0, updated: 0, deleted: 0, linked: 2 });
    let undone = undoLastPlan(deps);
    eq('undo of that: two links removed', undone.restored, { created: 0, updated: 0, deleted: 0, unlinked: 2 });
    res = executePlan(resolveOk(ops, planOf({ type: 'remove_from_board', board: 'Спринт 5', filter: { ids: [T('Экран логина')] } })), deps);
    eq('execute: one link removed', res.counts, { created: 0, updated: 0, deleted: 0, unlinked: 1 });
    undoLastPlan(deps);
    res = executePlan(resolveOk(ops, planOf({ type: 'delete_tasks', ids: [T('Проверка паспортов')] })), deps);
    eq('deleting a task that is on a board counts the task only', res.counts, { created: 0, updated: 0, deleted: 1 });
    undoLastPlan(deps);
    res = executePlan(resolveOk(ops, planOf({ type: 'create_board', name: 'Н' }, { type: 'create_task_type', name: 'Т' })), deps);
    eq('boards and types are counted', res.counts, { created: 2, updated: 0, deleted: 0 });
}

section('phase 5: cascade parity with src/db/schema.ts (boards, task types)');
{
    const schemaSrc = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');
    const between = (from, to) => { const a = schemaSrc.indexOf(from); const b = schemaSrc.indexOf(to, a); return schemaSrc.slice(a, b); };
    const stmts = block => [...block.matchAll(/(DELETE FROM \w+|UPDATE \w+ SET \w+ = NULL)/g)].map(m => m[1]).sort();
    const { ops } = freshDb();
    const tablesOf = r => [...new Set(r.plan.mutations.map(m => `${m.op}:${m.table}`))].sort();

    const boardStatements = stmts(between('    boards: {', '    boardTasks: {'));
    eq('façade: boards.delete removes links, then the board', boardStatements, ['DELETE FROM board_tasks', 'DELETE FROM boards']);
    eq('delete_board touches exactly those tables', tablesOf(resolveOn(ops, planOf({ type: 'delete_board', board: 'Спринт 5' }))), ['delete:board_tasks', 'delete:boards']);

    const typeStatements = stmts(between('    taskTypes: {', '    boards: {'));
    eq('façade: taskTypes.delete unassigns tasks, then removes the type', typeStatements, ['DELETE FROM task_types', 'UPDATE tasks SET taskTypeId = NULL']);
    eq('delete_task_type touches exactly those tables', tablesOf(resolveOn(ops, planOf({ type: 'delete_task_type', taskType: 'Согласование' }))), ['delete:task_types', 'update:tasks']);
}

fs.rmSync(tmpRoot, { recursive: true, force: true });

// ==== parity with the db.* façade (static) ==============================================================
section('cascade parity with src/db/schema.ts');
{
    const schemaSrc = fs.readFileSync(path.join(ROOT, 'src/db/schema.ts'), 'utf8');
    const between = (from, to) => { const a = schemaSrc.indexOf(from); const b = schemaSrc.indexOf(to, a); return schemaSrc.slice(a, b); };
    const deletedTables = block => new Set([...block.matchAll(/DELETE FROM (\w+)/g)].map(m => m[1]));
    const tableSet = r => new Set(r.plan.mutations.filter(m => m.op === 'delete').map(m => m.table));
    const same = (a, b) => JSON.stringify([...a].sort()) === JSON.stringify([...b].sort());

    const { ops } = freshDb();
    const projectCascade = deletedTables(between('    projects: {', '    tasks: {'));
    check('façade project delete statements were found', projectCascade.size >= 4, [...projectCascade].join());
    check('delete_project removes rows from exactly the tables db.projects.delete does', same(tableSet(resolveOn(ops, planOf({ type: 'delete_project', project: 'KYC' }))), projectCascade),
        `façade: ${[...projectCascade]}`);

    const taskCascade = deletedTables(between('    tasks: {', '    templates: {'));
    check('delete_tasks removes rows from exactly the tables db.tasks.delete does', same(tableSet(resolveOn(ops, planOf({ type: 'delete_tasks', ids: [fixtures.byTitle('Проверка паспортов').id] }))), taskCascade),
        `façade: ${[...taskCascade]}`);

    // A table the façade knows but the registry does not would be silently skipped by cascades and undo.
    const known = new Set([...Object.keys(TABLE_COLUMNS), 'templates']);
    const created = new Set([...schemaSrc.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map(m => m[1]));
    check('every table created in schema.ts is known to ops.ts', [...created].every(t => known.has(t)), [...created].filter(t => !known.has(t)).join());
}

// ==== NEXT SECTIONS ======================================================================================

console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? 'SOME CHECKS FAILED' : 'all checks passed');
process.exit(failed ? 1 : 0);
