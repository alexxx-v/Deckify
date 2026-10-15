#!/usr/bin/env node
/*
 * Quality gate for the assistant: the 10 reference requests of the Phase 1 spike plus multi-turn scenarios, run
 * through the PRODUCTION agent code (prompt, context, turn loop, registry) against a real Ollama model.
 *   node scripts/ai-agent-live.mjs [--model gpt-oss:120b-cloud] [--runs 2] [--min 0.8] [--base-url http://localhost:11434]
 * In-memory fixture database only. Skips (exit 0) when Ollama is unreachable. Exit 1 when the pass rate of the 10
 * reference requests is below --min / --min-core. Judge a failure by repeating it (--runs 12 --cases <id>), not by one run.
 */
import { bigDb, freshDb, fixtures } from './ai-test-db.mjs';
import { cases } from './ai-spike/cases.mjs';
import { actionCases, queryCases } from './ai-cases-phase5.mjs';
import { matchExpected, effectsOf } from './ai-actions-helpers.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const MODEL = opt('model', 'gpt-oss:120b-cloud');
const RUNS = Number(opt('runs', 2));
const MIN = Number(opt('min', 0.8));            // new cases (Phase 5): the PRD bar
// The original 10 + the dialogues must not regress. The model is stochastic: 1.0 was reached in most runs, but a benign
// clarifying question ("which steps?") shows up in ~5% of create requests, so the default tolerates one in twenty.
const MIN_CORE = Number(opt('min-core', 0.95));
const BASE = opt('base-url', 'http://localhost:11434').replace(/\/$/, '');
const CASES = opt('cases', '') ? opt('cases', '').split(',') : null;   // ids of reference cases; skips dialogue scenarios unless --only
const ONLY = opt('only', '');   // substring of a dialogue scenario name; also skips the 10 reference requests

const { createOllamaProvider } = await import('../src/features/ai/ollamaProvider.ts');
const { runAgentTurn } = await import('../src/features/ai/agent/agent.ts');
const { buildContext } = await import('../src/features/ai/agent/context.ts');
const { resolvePlan } = await import('../src/features/ai/actions/resolve.ts');
const readTools = await import('../src/features/ai/actions/readTools.ts');

const transport = {
    async request(req) {
        const url = (req.target === 'cloud' ? 'https://ollama.com' : req.baseUrl) + req.path;
        try {
            const res = await fetch(url, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.body === undefined ? undefined : JSON.stringify(req.body),
                signal: AbortSignal.any([AbortSignal.timeout(req.timeoutMs ?? 240_000), ...(req.signal ? [req.signal] : [])]),
            });
            const text = await res.text();
            let json; try { json = JSON.parse(text); } catch { /* not JSON */ }
            return { ok: res.ok, status: res.status, json, text };
        } catch (e) {
            return { ok: false, status: 0, networkError: String(e?.cause?.code ?? e?.message ?? e) };
        }
    },
};

const up = await transport.request({ target: 'local', baseUrl: BASE, path: '/api/version', method: 'GET', timeoutMs: 3000 });
if (!up.ok) { console.log(`SKIP: no Ollama at ${BASE} — nothing was measured`); process.exit(0); }

const provider = createOllamaProvider({ mode: 'local', baseUrl: BASE, model: MODEL }, transport);
const { TODAY } = fixtures;
const KYC = fixtures.projectByName('KYC').id;
const screenFor = c => (c.screen?.projectName
    ? { tab: 'projects', projectId: fixtures.projectByName(c.screen.projectName).id, taskId: null, boardId: null, projectSettingsId: null }
    : { tab: 'dashboard', projectId: null, taskId: null, boardId: null, projectSettingsId: null });

function depsFor(ops) {
    let n = 0;
    return {
        chat: req => provider.chat(req),
        resolve: v => resolvePlan(v, ops, { today: TODAY, now: 1_700_000_000_000, newId: () => `new-${++n}` }),
        context: screen => buildContext(ops, { today: TODAY, screen }),
        today: () => TODAY,
        runQuery(tool, args) {
            switch (tool) {
                case 'list_projects': return readTools.listProjects(ops);
                case 'list_tasks': return readTools.listTasks(ops, TODAY, args);
                case 'get_task': return readTools.getTask(ops, TODAY, String(args.id ?? ''));
                case 'list_boards': return readTools.listBoards(ops);
                case 'list_task_types': return readTools.listTaskTypes(ops);
                default: return { error: `unknown tool ${tool}` };
            }
        },
    };
}
const run = (ops, input) => runAgentTurn({ history: [], previousPlan: 'none', ...input }, depsFor(ops));
const fold = t => String(t).toLowerCase().replaceAll('ё', 'е');
const describe = r => (r.kind === 'reply' ? `reply ${JSON.stringify(r.reply.slice(0, 420))}` : r.kind === 'invalid' ? `invalid: ${r.problems.join('; ').slice(0, 160)}` : r.kind === 'provider' ? `provider: ${r.error.kind} ${r.error.detail ?? ''}` : r.kind);

// ---- reference requests -------------------------------------------------------------------------------
console.log(`model ${MODEL}, ${RUNS} run(s) per case\n`);
async function runGroup(title, all) {
    const list = CASES ? all.filter(c => CASES.includes(c.id)) : all;
    if (list.length === 0) return 1;
    console.log(`${title}`);
    let ok = 0, total = 0, retried = 0;
    for (const c of list) {
        let pass = 0;
        let queryRoundsSeen = 0;
        const why = [];
        for (let i = 0; i < RUNS; i++) {
            const { ops } = c.build === 'big' ? bigDb() : freshDb();
            const r = await run(ops, { userText: c.user, screen: screenFor(c) });
            total++;
            if (r.attempts > 1) retried++;
            if (r.queryRounds > 0) queryRoundsSeen++;
            let problems;
            if (r.kind === 'plan') {
                problems = matchExpected(r.plan, c);
            } else if (r.kind === 'reply') {
                if (c.expected.effects.length) problems = [`expected a plan, got a reply: ${r.reply.slice(0, 80)}`];
                else {
                    problems = [];
                    if (c.expected.clarification && !r.reply.trim()) problems.push('empty clarification');
                    for (const s of c.expected.replyIncludes ?? []) if (!fold(r.reply).includes(fold(s))) problems.push(`reply lacks «${s}»`);
                    if (c.expected.replyIncludesAny && !c.expected.replyIncludesAny.some(x => fold(r.reply).includes(fold(x)))) problems.push(`reply has none of ${JSON.stringify(c.expected.replyIncludesAny)}`);
                    for (const s of c.expected.replyExcludes ?? []) if (fold(r.reply).includes(fold(s))) problems.push(`reply must not contain «${s}»`);
                }
            } else {
                problems = [describe(r)];
            }
            if (problems.length && r.kind === 'reply') problems.push(`reply was: ${JSON.stringify(r.reply.slice(0, 300))}`);
            // a reply-only expectation must not come back as a plan with changes
            if (r.kind === 'plan' && !c.expected.effects.length) problems.push('expected no changes');
            if (problems.length === 0) { pass++; ok++; } else why.push(problems.join('; '));
        }
        console.log(`  ${c.id.padEnd(22)} ${pass}/${RUNS}${why.length ? '   ' + why[0].slice(0, 220) : ''}`);
        if (queryRoundsSeen) console.log(`  ${''.padEnd(22)} (model used queries in ${queryRoundsSeen}/${RUNS} runs)`);
    }
    const rate = total ? ok / total : 1;
    console.log(`  → ${ok}/${total} = ${(rate * 100).toFixed(0)}%  (needed a retry: ${retried})\n`);
    return rate;
}
const coreRate = ONLY ? 1 : await runGroup('original 10 reference requests (Phase 1)', cases);
const newRate = ONLY ? 1 : await runGroup('Phase 5 reference requests: boards and task types', actionCases);
const queryRate = ONLY ? 1 : await runGroup('Phase 5 data questions (context or queries)', queryCases);

// ---- dialogue scenarios -----------------------------------------------------------------------------
console.log('\ndialogue scenarios');
const KYC_SCREEN = { tab: 'projects', projectId: KYC, taskId: null, boardId: null, projectSettingsId: null };
const firstAsk = 'создай задачу: настроить проверку биометрии, старт сегодня, срок 7 дней, опиши шаги';
const createsOf = r => (r.kind === 'plan' ? effectsOf(r.plan).filter(e => e.op === 'create_task') : []);

const scenarios = [
    {
        name: 'refine the duration of a pending plan',
        async go(ops) {
            const a = await run(ops, { userText: firstAsk, screen: KYC_SCREEN });
            if (a.kind !== 'plan') return `first turn: ${describe(a)}`;
            const b = await run(ops, { userText: 'нет, срок 10 дней', screen: KYC_SCREEN, history: [{ role: 'user', content: firstAsk }, { role: 'assistant', content: a.assistantJson }], previousPlan: 'pending' });
            const c = createsOf(b);
            return b.kind === 'plan' && c.length === 1 && c[0].durationDays === 10 && c[0].start === '2026-10-13' ? null : `refined: ${b.kind} ${JSON.stringify(c.map(x => [x.start, x.durationDays]))}`;
        },
    },
    {
        name: 'refine the start date of a pending plan',
        async go(ops) {
            const a = await run(ops, { userText: firstAsk, screen: KYC_SCREEN });
            if (a.kind !== 'plan') return `first turn: ${describe(a)}`;
            const b = await run(ops, { userText: 'сделай старт завтра', screen: KYC_SCREEN, history: [{ role: 'user', content: firstAsk }, { role: 'assistant', content: a.assistantJson }], previousPlan: 'pending' });
            const c = createsOf(b);
            return b.kind === 'plan' && c.length === 1 && c[0].start === '2026-10-14' && c[0].durationDays === 7 ? null : `refined: ${b.kind} ${b.kind === 'reply' ? JSON.stringify(b.reply) : JSON.stringify(c.map(x => [x.start, x.durationDays]))}`;
        },
    },
    {
        name: 'clarification question, then an explicit answer',
        async go(ops) {
            const a = await run(ops, { userText: 'сдвинь задачи', screen: screenFor({}) });
            if (a.kind !== 'reply') return `first turn should be a question, got ${describe(a)}`;
            const ask = 'сдвинь на неделю вперёд все задачи проекта KYC со статусом «в работе»';
            const b = await run(ops, { userText: ask, screen: screenFor({}), history: [{ role: 'user', content: 'сдвинь задачи' }, { role: 'assistant', content: a.assistantJson }] });
            if (b.kind !== 'plan') return `second turn: ${describe(b)}`;
            const problems = matchExpected(b.plan, cases.find(x => x.id === 'bulk-shift'));
            return problems.length ? problems.join('; ') : null;
        },
    },
    {
        name: 'clarification, then a terse answer (ambiguous wording; informational)',
        informational: true,
        async go(ops) {
            const a = await run(ops, { userText: 'сдвинь задачи', screen: screenFor({}) });
            if (a.kind !== 'reply') return `first turn should be a question, got ${describe(a)}`;
            const ask = 'на неделю все задачи KYC в работе';
            const b = await run(ops, { userText: ask, screen: screenFor({}), history: [{ role: 'user', content: 'сдвинь задачи' }, { role: 'assistant', content: a.assistantJson }] });
            if (b.kind !== 'plan') return `second turn: ${describe(b)}`;
            const problems = matchExpected(b.plan, cases.find(x => x.id === 'bulk-shift'));
            return problems.length ? problems.join('; ') : null;
        },
    },
    {
        name: 'an unrelated question after a rejected plan does not replay it',
        async go(ops) {
            const first = 'Добавь все задачи KYC в доску Спринт 5';
            const a = await run(ops, { userText: first, screen: KYC_SCREEN });
            if (a.kind !== 'plan') return `first turn: ${describe(a)}`;
            const b = await run(ops, { userText: 'Какие задачи в доске Спринт 5?', screen: KYC_SCREEN, history: [{ role: 'user', content: first }, { role: 'assistant', content: a.assistantJson }], previousPlan: 'rejected' });
            if (b.kind === 'plan') return `replayed a plan with ${b.plan.mutations.length} changes`;
            if (b.kind !== 'reply') return describe(b);
            return ['Проверка паспортов', 'Экран логина'].every(t => fold(b.reply).includes(fold(t))) ? null : `answer lacks the board's tasks: ${JSON.stringify(b.reply.slice(0, 160))}`;
        },
    },
    {
        name: 'after an executed plan "верни как было" does not delete anything',
        async go(ops) {
            const a = await run(ops, { userText: firstAsk, screen: KYC_SCREEN });
            if (a.kind !== 'plan') return `first turn: ${describe(a)}`;
            const b = await run(ops, { userText: 'верни как было', screen: KYC_SCREEN, history: [{ role: 'user', content: firstAsk }, { role: 'assistant', content: a.assistantJson }], previousPlan: 'executed' });
            const destructive = b.kind === 'plan' ? b.plan.mutations.filter(m => m.op === 'delete').length : 0;
            return destructive ? `produced ${destructive} deletions` : null;
        },
    },
];
let dialogueFailures = 0, dialogueTotal = 0;
for (const sc of scenarios.filter(x => ONLY ? x.name.includes(ONLY) : !CASES)) {
    let pass = 0; const why = [];
    for (let i = 0; i < RUNS; i++) {
        if (!sc.informational) dialogueTotal++;
        const { ops } = freshDb();
        const problem = await sc.go(ops);
        if (!problem) pass++; else { if (!sc.informational) dialogueFailures++; why.push(problem); }
    }
    console.log(`${sc.name.padEnd(62)} ${pass}/${RUNS}${why.length ? '   ' + why[0].slice(0, 520) : ''}`);
}

const dialogueRate = dialogueTotal ? 1 - dialogueFailures / dialogueTotal : 1;
console.log(`\ndialogue scenarios: ${dialogueTotal - dialogueFailures}/${dialogueTotal} = ${(dialogueRate * 100).toFixed(0)}%`);
console.log(`\nsummary: original ${(coreRate * 100).toFixed(0)}% (needs ${MIN_CORE * 100}%), dialogues ${(dialogueRate * 100).toFixed(0)}% (needs ${MIN_CORE * 100}%), Phase 5 actions ${(newRate * 100).toFixed(0)}% (needs ${MIN * 100}%), data questions ${(queryRate * 100).toFixed(0)}% (needs ${MIN * 100}%)`);
const gate = coreRate >= MIN_CORE && dialogueRate >= MIN_CORE && newRate >= MIN && queryRate >= MIN;
console.log(gate ? '\nGATE PASSED' : '\nGATE FAILED');
process.exit(gate ? 0 : 1);
