#!/usr/bin/env node
/*
 * Checks for the assistant's agent core (src/features/ai/agent/): prompt, context, turn loop, conversation state.
 *   node scripts/ai-agent-check.mjs
 * A scripted fake model stands in for Ollama and records the exact messages it receives. In-memory SQLite from
 * mcp/node_modules (see ai-test-db.mjs). No network, no real database.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { Database, TEST_DDL, createOps, fixtures, freshDb } from './ai-test-db.mjs';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
let failed = 0;
let passed = 0;
const check = (name, cond, detail = '') => {
    if (cond) { passed++; console.log(`ok   ${name}`); }
    else { failed++; console.log(`FAIL ${name} ${detail}`); }
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const section = title => console.log(`\n# ${title}`);

const { buildSystemPrompt, retryFeedback, PREVIOUS_PLAN_NOTE, NOT_JSON_FEEDBACK } = await import('../src/features/ai/agent/prompt.ts');
const { buildContext, MAX_CONTEXT_TASKS } = await import('../src/features/ai/agent/context.ts');
const { runAgentTurn } = await import('../src/features/ai/agent/agent.ts');
const cs = await import('../src/features/ai/agent/conversationState.ts');
const { resolvePlan } = await import('../src/features/ai/actions/resolve.ts');
const { buildPlanFormatSchema, describeActionsForPrompt } = await import('../src/features/ai/actions/specs.ts');
const { AiError } = await import('../src/features/ai/types.ts');

const { TODAY } = fixtures;
const KYC = fixtures.projectByName('KYC').id;
const MARKETING = fixtures.projectByName('Маркетинг').id;
const screen = (over = {}) => ({ tab: 'dashboard', projectId: null, taskId: null, boardId: null, projectSettingsId: null, ...over });
const mkCtx = () => { let n = 0; return { today: TODAY, now: 1_700_000_000_000, newId: () => `new-${++n}` }; };

// ==== prompt ================================================================================================
section('prompt');
{
    const src = fs.readFileSync(path.join(ROOT, 'scripts/ai-spike/run.mjs'), 'utf8');
    const m = /const SYSTEM = `([\s\S]*?)`;/.exec(src);
    check('found the spike SYSTEM prompt', !!m);
    const spike = m[1].replace('${TODAY}', TODAY);
    const ours = buildSystemPrompt(TODAY);
    check('the spike\'s measured prompt is included word for word', ours.startsWith(spike), ours.slice(0, 80));
    check('refinement rule added', ours.includes('верни ПОЛНЫЙ обновлённый план'));
    check('schema + action list repeated in the prompt (format is not shown to the model)', ours.endsWith(describeActionsForPrompt()) && ours.includes('"actions"'));
    eq('retry feedback equals the spike\'s', retryFeedback(['а', 'б']), 'План не принят приложением:\n- а\n- б\nИсправь план.');
    eq('previous-plan notes', Object.keys(PREVIOUS_PLAN_NOTE), ['executed', 'rejected', 'pending']);
}

// ==== context ===============================================================================================
section('context');
{
    const { ops, sqlite } = freshDb();
    const ctx = (over, args = {}) => buildContext(ops, { today: TODAY, screen: screen(over), ...args });
    const line = (text, prefix) => text.split('\n').find(l => l.startsWith(prefix));
    const screenLineOf = over => line(ctx(over).text, 'Открытый экран:');

    eq('dashboard', screenLineOf({ tab: 'dashboard' }), 'Открытый экран: дашборд');
    eq('project list', screenLineOf({ tab: 'projects' }), 'Открытый экран: список проектов');
    eq('boards / templates / settings', ['boards', 'templates', 'settings'].map(tab => screenLineOf({ tab })), ['Открытый экран: список досок', 'Открытый экран: шаблоны PDF', 'Открытый экран: настройки']);
    eq('open project', screenLineOf({ tab: 'projects', projectId: KYC }), `Открытый экран: проект «KYC» (id ${KYC})`);
    const passports = fixtures.byTitle('Проверка паспортов');
    eq('open task wins over the project', screenLineOf({ tab: 'projects', projectId: KYC, taskId: passports.id }), `Открытый экран: задача «Проверка паспортов» (id ${passports.id}) в проекте «KYC»`);
    eq('project settings', screenLineOf({ tab: 'projects', projectSettingsId: KYC }), `Открытый экран: настройки проекта «KYC» (id ${KYC})`);
    eq('board', screenLineOf({ tab: 'boards', boardId: fixtures.boards[0].id }), 'Открытый экран: доска «Спринт 5»');
    eq('a deleted task falls back to the project', screenLineOf({ tab: 'projects', projectId: KYC, taskId: 'gone' }), `Открытый экран: проект «KYC» (id ${KYC})`);
    eq('a deleted project falls back to the tab', screenLineOf({ tab: 'projects', projectId: 'gone' }), 'Открытый экран: список проектов');

    const text = ctx({ tab: 'projects', projectId: KYC }).text;
    eq('date line', line(text, 'Сегодня:'), 'Сегодня: 2026-10-13 (Tuesday)');
    // every line of the spike's context is present (layout unchanged), apart from task order and the marker
    const spikeLines = fixtures.contextFor({ projectName: 'KYC' }).split('\n').filter(l => l.trim());
    const ourLines = new Set(text.split('\n').map(l => l.replace(' | просрочена', '')));
    const missing = spikeLines.filter(l => !ourLines.has(l) && !l.startsWith('Типы задач:'));
    eq('layout is a superset of the spike\'s measured layout', missing, []);
    check('task types line lists the global types (this DB also has a project-scoped one)', /^Типы задач: Разработка, Согласование/.test(line(text, 'Типы задач:')));
    eq('ids are printed in full', fixtures.tasks.every(t => text.includes(t.id)), true);

    const overdueIds = text.split('\n').filter(l => l.endsWith(' | просрочена')).map(l => l.split(' | ')[0]).sort();
    eq('overdue marker only on KYC/Legacy overdue tasks', overdueIds, ['Верификация адреса', 'Отчёт для регулятора', 'Миграция старых анкет'].map(t => fixtures.byTitle(t).id).sort());
    check('open project tasks come first', text.split('\n').slice(text.split('\n').findIndex(l => l.startsWith('Задачи (id')) + 1).slice(0, 6).every(l => l.split(' | ')[1] === 'KYC'));
    const marketingFirst = ctx({ tab: 'projects', projectId: MARKETING }).text.split('\n');
    check('another project in focus reorders', marketingFirst[marketingFirst.findIndex(l => l.startsWith('Задачи (id')) + 1].split(' | ')[1] === 'Маркетинг');

    sqlite.prepare(`UPDATE tasks SET description = 'СЕКРЕТНОЕ ОПИСАНИЕ', startDate = '', duration = 0 WHERE title = 'Лендинг'`).run();
    const eff = ctx({}).text;
    check('descriptions never go to the model', !eff.includes('СЕКРЕТНОЕ'));
    check('effective (planned) dates are used when the actual layer is empty', eff.includes(`| ${fixtures.byTitle('Лендинг').title} | progress | 2026-10-01 | 20`) || /Лендинг \| progress \| 2026-10-01 \| 20/.test(eff));

    // budget
    const big = new Database(':memory:'); big.exec(TEST_DDL);
    const bigOps = createOps(big);
    bigOps.insert('projects', { id: 'pa', name: 'Малый', createdAt: 1 });
    bigOps.insert('projects', { id: 'pb', name: 'Большой', createdAt: 2 });
    const ins = big.prepare(`INSERT INTO tasks (id, projectId, title, description, startDate, duration, plannedStartDate, plannedDuration, progress, status, steps, taskTypeId) VALUES (?, ?, ?, '', ?, 3, ?, 3, 0, ?, '[]', NULL)`);
    big.transaction(() => {
        for (let i = 0; i < 400; i++) ins.run(`b-${String(i).padStart(3, '0')}`, 'pb', `Задача ${i}`, '2026-12-01', '2026-12-01', i % 5 === 0 ? 'done' : 'backlog');
        ins.run('a-1', 'pa', 'Задача малого проекта', '2026-12-02', '2026-12-02', 'backlog');
    })();
    const capped = buildContext(bigOps, { today: TODAY, screen: screen({ tab: 'projects', projectId: 'pa' }) });
    eq('task cap', [capped.shownTasks, capped.totalTasks, capped.truncated, MAX_CONTEXT_TASKS], [150, 401, true, 150]);
    check('truncation note names the numbers', capped.text.includes('Показаны 150 из 401 задач'));
    check('the open project\'s task is shown despite the cap', capped.text.includes('Задача малого проекта'));
    check('done tasks are dropped before active ones', !capped.text.includes('| b-000 |') && capped.text.includes('b-001'));
    const small = buildContext(bigOps, { today: TODAY, screen: screen({}), maxChars: 600 });
    const taskBlock = small.text.split('\n').slice(small.text.split('\n').findIndex(l => l.startsWith('Задачи (id')) + 1).filter(l => /^b-|^a-/.test(l));
    check('character budget applies to the task lines', small.truncated && taskBlock.length === small.shownTasks && taskBlock.join('\n').length <= 600 && small.shownTasks < 20, `${small.shownTasks} ${taskBlock.join('\n').length}`);
    const uncapped = buildContext(ops, { today: TODAY, screen: screen({}) });
    eq('no note when everything fits', [uncapped.truncated, uncapped.text.includes('Показаны')], [false, false]);
}

// ==== turn ==================================================================================================
function fakeModel(replies) {
    const calls = [];
    let i = 0;
    return {
        calls,
        async chat(req) {
            calls.push(JSON.parse(JSON.stringify({ messages: req.messages, format: req.format })));
            const r = replies[Math.min(i++, replies.length - 1)];
            if (r instanceof Error) throw r;
            if (typeof r === 'function') return r(req);
            return { message: { role: 'assistant', content: typeof r === 'string' ? r : JSON.stringify(r) }, latencyMs: 1 };
        },
    };
}
const depsFor = (ops, model) => {
    const contexts = { n: 0 };
    return {
        contexts,
        chat: req => model.chat(req),
        resolve: v => resolvePlan(v, ops, mkCtx()),
        context: s => { contexts.n++; return buildContext(ops, { today: TODAY, screen: s }); },
        today: () => TODAY,
    };
};
const turn = (ops, replies, input = {}) => {
    const model = fakeModel(replies);
    const deps = depsFor(ops, model);
    return runAgentTurn({ userText: 'создай задачу', history: [], screen: screen({ tab: 'projects', projectId: KYC }), previousPlan: 'none', ...input }, deps)
        .then(result => ({ result, model, deps }));
};
const createPlan = { reply: 'Создам задачу в KYC.', actions: [{ type: 'create_task', project: 'KYC', title: 'Настроить биометрию', start: 'today', duration: '7d' }] };

section('turn');
{
    const { ops } = freshDb();

    let { result, model, deps } = await turn(ops, [createPlan]);
    eq('valid plan → plan', [result.kind, result.attempts, result.jsonRepaired, result.plan?.mutations.length, result.plan?.diff[0].label], ['plan', 1, null, 1, 'Настроить биометрию']);
    eq('assistantJson is the normalised plan', JSON.parse(result.assistantJson), createPlan);
    eq('one model call, with the plan schema as `format`', [model.calls.length, model.calls[0].format], [1, buildPlanFormatSchema()]);
    const [sys, usr] = model.calls[0].messages;
    eq('messages: system then user', [sys.role, usr.role, model.calls[0].messages.length], ['system', 'user', 2]);
    check('system prompt is the built one', sys.content === buildSystemPrompt(TODAY));
    check('user message = context block + request', usr.content.startsWith(`Сегодня: ${TODAY}`) && usr.content.endsWith('\n\nЗапрос: создай задачу') && usr.content.includes('Открытый экран: проект «KYC»'));

    ({ result } = await turn(ops, ['```json\n' + JSON.stringify(createPlan) + '\n```']));
    eq('fenced JSON is accepted', [result.kind, result.jsonRepaired], ['plan', 'fence']);

    ({ result } = await turn(ops, [{ reply: 'Какие именно задачи?', actions: [] }]));
    eq('actions: [] → reply', [result.kind, result.reply], ['reply', 'Какие именно задачи?']);

    ({ result, model } = await turn(ops, ['not json at all', createPlan]));
    eq('unparsable first answer → one retry → plan', [result.kind, result.attempts, model.calls.length], ['plan', 2, 2]);
    const retry = model.calls[1].messages;
    eq('retry appends the raw answer and the feedback', [retry.length, retry[retry.length - 2], retry[retry.length - 1].role], [4, { role: 'assistant', content: 'not json at all' }, 'user']);
    check('retry feedback text', retry[retry.length - 1].content === retryFeedback([NOT_JSON_FEEDBACK]));
    eq('history gets only the final JSON, not the failed exchange', JSON.parse(result.assistantJson), createPlan);

    const wrongProject = { reply: '', actions: [{ type: 'create_task', project: 'KYC2', title: 'x', start: 'today', duration: '1d' }] };
    ({ result, model } = await turn(ops, [wrongProject, createPlan]));
    eq('resolution error → one retry → plan', [result.kind, result.attempts], ['plan', 2]);
    const feedback = model.calls[1].messages.at(-1).content;
    check('feedback names the problem and suggestions', feedback.startsWith('План не принят приложением:') && /Действие 1: проект «KYC2» не найден \(похожие: «KYC»/.test(feedback), feedback);

    ({ result, model } = await turn(ops, ['garbage', 'still garbage']));
    eq('two failures → invalid, no third call', [result.kind, result.problems, result.attempts, model.calls.length], ['invalid', [NOT_JSON_FEEDBACK], 2, 2]);
    ({ result, model } = await turn(ops, [wrongProject, wrongProject]));
    eq('two rejected plans → invalid with the issues', [result.kind, result.problems.length, /не найден/.test(result.problems[0])], ['invalid', 1, true]);
    ({ result, model } = await turn(ops, [{ reply: '', actions: [] }, { reply: '   ', actions: [] }]));
    eq('an empty plan is not accepted', [result.kind, model.calls.length], ['invalid', 2]);
    ({ result } = await turn(ops, [{ reply: '', actions: [{ type: 'delete_project', project: 'KYC' }] }]));
    eq('a plan with an empty reply is fine when it has actions', result.kind, 'plan');

    ({ result, model } = await turn(ops, [new AiError('unreachable', 'ECONNREFUSED')]));
    eq('provider error → provider, no retry', [result.kind, result.error?.kind, model.calls.length], ['provider', 'unreachable', 1]);
    ({ result } = await turn(ops, [new Error('boom')]));
    eq('unexpected error is wrapped', [result.kind, result.error?.kind], ['provider', 'bad_response']);

    const controller = new AbortController();
    controller.abort();
    ({ result, model } = await turn(ops, [createPlan], { signal: controller.signal }));
    eq('already aborted → aborted, model never called', [result.kind, model.calls.length], ['aborted', 0]);
    const c2 = new AbortController();
    ({ result, model } = await turn(ops, [() => { c2.abort(); return { message: { role: 'assistant', content: JSON.stringify(createPlan) }, latencyMs: 1 }; }], { signal: c2.signal }));
    eq('aborted while waiting → aborted even though an answer arrived', result.kind, 'aborted');
    const c3 = new AbortController();
    ({ result, model } = await turn(ops, ['garbage', () => { c3.abort(); return { message: { role: 'assistant', content: '{}' }, latencyMs: 1 }; }], { signal: c3.signal }));
    eq('abort stops the retry too', [result.kind, model.calls.length], ['aborted', 2]);
    ({ result } = await turn(ops, [new AiError('aborted')]));
    eq('provider "aborted" error → aborted', result.kind, 'aborted');

    const history = [{ role: 'user', content: 'создай задачу А' }, { role: 'assistant', content: JSON.stringify(createPlan) }];
    ({ result, model, deps } = await turn(ops, [createPlan], { history, previousPlan: 'pending', userText: 'нет, срок 10 дней' }));
    const msgs = model.calls[0].messages;
    eq('messages = system + history + user', [msgs.map(m => m.role), msgs[1], msgs[2]], [['system', 'user', 'assistant', 'user'], history[0], history[1]]);
    check('previous-plan note is the first line of the user message', msgs[3].content.startsWith(`${PREVIOUS_PLAN_NOTE.pending}\nСегодня:`));
    eq('only the latest user message carries a context block', msgs.filter(m => m.content.includes('Открытый экран:')).length, 1);
    eq('context is built once per turn, retries reuse it', (await turn(ops, ['bad', createPlan]).then(r => r.deps.contexts.n)), 1);
    ({ model } = await turn(ops, [createPlan], { previousPlan: 'none' }));
    check('no note when there was no previous plan', !model.calls[0].messages[1].content.startsWith('['));
}

// ==== conversation state ====================================================================================
section('conversation');
{
    const plan = { id: 'rp', diff: [], mutations: [], preconditions: [], warnings: [], affectedTaskIds: [], affectedProjectIds: [], createdAt: 1, today: TODAY, reply: '' };
    const planMsg = (id, status) => ({ id, kind: 'plan', reply: 'r', plan, status, attempts: 1 });
    let s = cs.initialConversation();
    eq('initial state', [s.messages.length, s.busy, s.history.length, s.lastUserText, cs.previousPlanState(s)], [0, false, 0, null, 'none']);

    s = cs.appendMessage(s, planMsg('p1', 'pending'));
    eq('pending plan → previous state "pending"', cs.previousPlanState(s), 'pending');
    const frozen = JSON.stringify(s);
    const s2 = cs.appendUser(s, 'u1', 'уточнение');
    eq('state objects are never mutated', JSON.stringify(s), frozen);
    eq('a user message alone leaves the pending plan pending (a failed turn must not lose it)', [s2.messages[0].status, s2.messages[1].kind, s2.lastUserText], ['pending', 'user', 'уточнение']);
    const s3 = cs.appendPlan(s2, planMsg('p2', 'pending'));
    eq('a newer plan supersedes the pending one', s3.messages.filter(m => m.kind === 'plan').map(m => [m.id, m.status]), [['p1', 'superseded'], ['p2', 'pending']]);
    eq('executed plans are not touched by a newer plan', cs.appendPlan(cs.appendMessage(cs.initialConversation(), planMsg('p3', 'executed')), planMsg('p4', 'pending')).messages[0].status, 'executed');
    check('only plan cards change', s3.messages[1].kind === 'user' && s3.messages[1] === s2.messages[1]);

    for (const [status, want] of [['pending', 'pending'], ['executed', 'executed'], ['rejected', 'rejected'], ['superseded', 'rejected'], ['stale', 'rejected'], ['failed', 'rejected'], ['undone', 'rejected']]) {
        eq(`previousPlanState for ${status}`, cs.previousPlanState(cs.appendMessage(cs.initialConversation(), planMsg('x', status))), want);
    }
    const mixed = [planMsg('a', 'executed'), { id: 'u', kind: 'user', text: 'x' }, planMsg('b', 'rejected')].reduce(cs.appendMessage, cs.initialConversation());
    eq('only the LAST plan counts', cs.previousPlanState(mixed), 'rejected');
    eq('latestExecutedPlan skips rejected/undone plans', cs.latestExecutedPlan([planMsg('a', 'executed'), planMsg('b', 'undone'), planMsg('c', 'rejected')].reduce(cs.appendMessage, cs.initialConversation()))?.id, 'a');
    eq('latestExecutedPlan: none', cs.latestExecutedPlan(cs.initialConversation()), null);

    const patched = cs.patchPlan(s, 'p1', { status: 'executed', outcome: { counts: { created: 1, updated: 0, deleted: 0 }, undo: 'saved' } });
    eq('patchPlan', [patched.messages[0].status, patched.messages[0].outcome.undo, s.messages[0].status], ['executed', 'saved', 'pending']);
    eq('findPlan', [cs.findPlan(patched, 'p1')?.id, cs.findPlan(patched, 'nope')], ['p1', null]);

    const busy = cs.setBusy(cs.initialConversation(), true, 1234);
    eq('busy flag', [busy.busy, busy.busySince, cs.setBusy(busy, false).busySince], [true, 1234, null]);

    let h = cs.initialConversation();
    for (let i = 1; i <= 12; i++) h = cs.commitTurn(h, `вопрос ${i}`, `{"reply":"ответ ${i}"}`);
    eq('history keeps the last 8 turns', [h.history.length, h.history[0].content, h.history.at(-1).content], [16, 'вопрос 5', '{"reply":"ответ 12"}']);
    eq('history stays in user/assistant pairs', h.history.map(m => m.role).join(''), 'userassistant'.repeat(8));
    const heavy = cs.commitTurn(cs.commitTurn(cs.initialConversation(), 'a', 'x'.repeat(9000)), 'b', 'y'.repeat(9000));
    eq('history is trimmed by size too, whole turns only', [heavy.history.length, heavy.history[0].content], [2, 'b']);
    eq('one oversized turn is kept (never emptied)', cs.commitTurn(cs.initialConversation(), 'a', 'x'.repeat(50000)).history.length, 2);
    eq('trimHistory ignores a dangling message', cs.trimHistory([{ role: 'user', content: 'a' }]).length, 0);

    const store = cs.createConversationStore();
    let calls = 0;
    const off = store.subscribe(() => { calls++; });
    const before = store.getState();
    check('getState is stable between updates (useSyncExternalStore requirement)', store.getState() === before);
    store.update(st => cs.appendUser(st, 'u', 'привет'));
    eq('update notifies once and replaces the state', [calls, store.getState() === before, store.getState().messages.length], [1, false, 1]);
    off();
    store.update(st => cs.setBusy(st, true, 1));
    eq('unsubscribed listeners are not called', calls, 1);
    store.reset();
    eq('reset clears everything', [store.getState().messages.length, store.getState().busy, store.getState().history.length], [0, false, 0]);
}

// ==== locales ===============================================================================================
section('locales');
{
    const en = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/locales/en.json'), 'utf8'));
    const ru = JSON.parse(fs.readFileSync(path.join(ROOT, 'src/locales/ru.json'), 'utf8'));
    const flat = (o, pre = '') => Object.entries(o).flatMap(([k, v]) => (v && typeof v === 'object' ? flat(v, `${pre}${k}.`) : [`${pre}${k}`]));
    eq('assistant: same keys in en and ru', flat(en.assistant).sort(), flat(ru.assistant).sort());
    eq('whole files: same keys in en and ru', flat(en).sort(), flat(ru).sort());
    check('no empty strings in assistant.*', flat(en.assistant).every(k => k.split('.').reduce((o, p) => o[p], en.assistant) !== '') && flat(ru.assistant).every(k => k.split('.').reduce((o, p) => o[p], ru.assistant) !== ''));

    const has = (tree, key) => key.split('.').reduce((o, p) => (o && typeof o === 'object' ? o[p] : undefined), tree) !== undefined;
    const files = ['src/features/assistant/AiAssistant.tsx', 'src/features/assistant/PlanCard.tsx', 'src/features/assistant/format.ts', 'src/App.tsx', 'src/features/settings/AiSettings.tsx'];
    const used = new Set();
    for (const f of files) {
        const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
        for (const m of src.matchAll(/\bt\(\s*'((?:assistant|settings\.ai)\.[A-Za-z0-9_.]+)'/g)) used.add(m[1]);
        for (const m of src.matchAll(/'((?:assistant)\.fields\.[A-Za-z]+)'/g)) used.add(m[1]);
    }
    // keys built from a variable: every possible value must exist
    for (const st of ['executed', 'rejected', 'superseded', 'stale', 'failed', 'undone']) used.add(`assistant.plan.${st}`);
    for (const op of ['create', 'update', 'delete']) used.add(`assistant.ops.${op}`);
    for (const e of ['task', 'project']) used.add(`assistant.entity.${e}`);
    for (const k of ['backlog', 'inProgress', 'onHold', 'done']) used.add(`taskEdit.${k}`);
    const missing = [...used].filter(k => !has(en, k) || !has(ru, k));
    eq(`all ${used.size} translation keys used by the assistant exist in both languages`, missing, []);
    const unused = flat(en.assistant).map(k => `assistant.${k}`).filter(k => !used.has(k) && !fs.readFileSync(path.join(ROOT, 'src/features/assistant/AiAssistant.tsx'), 'utf8').includes(k.replace('assistant.', '')));
    console.log(`     (keys not referenced literally: ${unused.length ? unused.join(', ') : 'none'})`);
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? 'SOME CHECKS FAILED' : 'all checks passed');
process.exit(failed ? 1 : 0);
