#!/usr/bin/env node
/*
 * Quality gate for the assistant: the 10 reference requests of the Phase 1 spike plus multi-turn scenarios, run
 * through the PRODUCTION agent code (prompt, context, turn loop, registry) against a real Ollama model.
 *   node scripts/ai-agent-live.mjs [--model gpt-oss:120b-cloud] [--runs 2] [--min 0.8] [--base-url http://localhost:11434]
 * In-memory fixture database only. Skips (exit 0) when Ollama is unreachable. Exit 1 when the pass rate of the 10
 * reference requests is below --min or a dialogue scenario fails more than allowed.
 */
import { freshDb, fixtures } from './ai-test-db.mjs';
import { cases } from './ai-spike/cases.mjs';
import { matchExpected, effectsOf } from './ai-actions-helpers.mjs';

const argv = process.argv.slice(2);
const opt = (name, def) => { const i = argv.indexOf(`--${name}`); return i >= 0 && argv[i + 1] ? argv[i + 1] : def; };
const MODEL = opt('model', 'gpt-oss:120b-cloud');
const RUNS = Number(opt('runs', 2));
const MIN = Number(opt('min', 0.8));
const BASE = opt('base-url', 'http://localhost:11434').replace(/\/$/, '');
const ONLY = opt('only', '');   // substring of a dialogue scenario name; also skips the 10 reference requests

const { createOllamaProvider } = await import('../src/features/ai/ollamaProvider.ts');
const { runAgentTurn } = await import('../src/features/ai/agent/agent.ts');
const { buildContext } = await import('../src/features/ai/agent/context.ts');
const { resolvePlan } = await import('../src/features/ai/actions/resolve.ts');

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
    };
}
const run = (ops, input) => runAgentTurn({ history: [], previousPlan: 'none', ...input }, depsFor(ops));
const describe = r => (r.kind === 'invalid' ? `invalid: ${r.problems.join('; ').slice(0, 160)}` : r.kind === 'provider' ? `provider: ${r.error.kind} ${r.error.detail ?? ''}` : r.kind);

// ---- the 10 reference requests ------------------------------------------------------------------------
console.log(`model ${MODEL}, ${RUNS} run(s) per case\n`);
let ok = 0, total = 0, retried = 0;
for (const c of ONLY ? [] : cases) {
    let pass = 0;
    const why = [];
    for (let i = 0; i < RUNS; i++) {
        const { ops } = freshDb();
        const r = await run(ops, { userText: c.user, screen: screenFor(c) });
        total++;
        if (r.attempts > 1) retried++;
        let problems;
        if (r.kind === 'plan') {
            problems = matchExpected(r.plan, c);
        } else if (r.kind === 'reply') {
            if (c.expected.effects.length) problems = [`expected a plan, got a reply: ${r.reply.slice(0, 80)}`];
            else {
                problems = [];
                if (c.expected.clarification && !r.reply.trim()) problems.push('empty clarification');
                for (const s of c.expected.replyIncludes ?? []) if (!r.reply.toLowerCase().includes(s.toLowerCase())) problems.push(`reply lacks «${s}»`);
                for (const s of c.expected.replyExcludes ?? []) if (r.reply.toLowerCase().includes(s.toLowerCase())) problems.push(`reply must not contain «${s}»`);
            }
        } else {
            problems = [describe(r)];
        }
        // a reply-only expectation must not come back as a plan with changes
        if (r.kind === 'plan' && !c.expected.effects.length) problems.push('expected no changes');
        if (problems.length === 0) { pass++; ok++; } else why.push(problems.join('; '));
    }
    console.log(`${c.id.padEnd(16)} ${pass}/${RUNS}${why.length ? '   ' + why[0].slice(0, 150) : ''}`);
}
const rate = total ? ok / total : 1;
console.log(`\nreference requests: ${ok}/${total} = ${(rate * 100).toFixed(0)}%  (needed a retry: ${retried})`);

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
        name: 'clarification question, then the answer',
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
for (const sc of scenarios.filter(x => !ONLY || x.name.includes(ONLY))) {
    let pass = 0; const why = [];
    for (let i = 0; i < RUNS; i++) {
        dialogueTotal++;
        const { ops } = freshDb();
        const problem = await sc.go(ops);
        if (!problem) pass++; else { dialogueFailures++; why.push(problem); }
    }
    console.log(`${sc.name.padEnd(62)} ${pass}/${RUNS}${why.length ? '   ' + why[0].slice(0, 140) : ''}`);
}

const dialogueRate = 1 - dialogueFailures / dialogueTotal;
console.log(`\ndialogue scenarios: ${dialogueTotal - dialogueFailures}/${dialogueTotal} = ${(dialogueRate * 100).toFixed(0)}%`);
const gate = rate >= MIN && dialogueRate >= MIN;
console.log(gate ? `\nGATE PASSED (>= ${MIN * 100}%)` : `\nGATE FAILED (< ${MIN * 100}%)`);
process.exit(gate ? 0 : 1);
