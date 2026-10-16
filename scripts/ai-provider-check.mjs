#!/usr/bin/env node
/*
 * Checks for src/features/ai (the repo has no test runner). Plain Node, same style as ai-spike/score.mjs:
 *   node scripts/ai-provider-check.mjs
 * Runs the TypeScript modules directly via Node's built-in type stripping, so those modules use
 * `.ts` import extensions and `import type`. The live section is skipped when no local Ollama answers.
 */
import {
    CLOUD_URL, DEFAULT_LOCAL_URL, MIN_OLLAMA_VERSION, classifyFailure, compareVersions,
    filterChatModels, hostOf, isLoopbackUrl, isSmallModel, neededNumCtx, normalizeBaseUrl, parseParamSizeB,
} from '../src/features/ai/ollamaUtils.ts';
import { extractJson } from '../src/features/ai/json.ts';
import { createOllamaProvider } from '../src/features/ai/ollamaProvider.ts';
import { AiError } from '../src/features/ai/types.ts';

let failed = 0;
let passed = 0;
const check = (name, cond, detail = '') => {
    if (cond) { passed++; console.log(`ok   ${name}`); }
    else { failed++; console.log(`FAIL ${name} ${detail}`); }
};
const eq = (name, got, want) => check(name, JSON.stringify(got) === JSON.stringify(want), `got ${JSON.stringify(got)}, want ${JSON.stringify(want)}`);
const rejects = async (name, fn, kind) => {
    try { await fn(); check(name, false, 'did not throw'); }
    catch (e) { check(name, e instanceof AiError && e.kind === kind, `threw ${e?.kind ?? e}`); }
};

// ---- 1. utils --------------------------------------------------------------------------------------
for (const [input, want] of [
    ['localhost:11434', 'http://localhost:11434'],
    ['http://x:1/', 'http://x:1'],
    ['http://x:1/api', 'http://x:1'],
    ['https://host/ollama/api/', 'https://host/ollama'],
    ['  http://127.0.0.1:11434  ', 'http://127.0.0.1:11434'],
    ['ftp://x', null],
    ['', null],
    ['http://user:pw@x', null],
]) eq(`normalizeBaseUrl(${JSON.stringify(input)})`, normalizeBaseUrl(input), want);
eq('default local url is already normalized', normalizeBaseUrl(DEFAULT_LOCAL_URL), DEFAULT_LOCAL_URL);

for (const [size, name, want] of [
    ['116.8B', 'gpt-oss:120b-cloud', 116.8],
    ['270M', 'gemma3:270m', 0.27],
    ['', 'gemma4:31b-cloud', 31],
    ['', 'gpt-oss:120b-cloud', 120],
    ['', 'llama3.2:3b', 3],
    ['', 'gemma4:e2b', 2],
    ['', 'qwen2.5:0.5b', 0.5],
    [undefined, 'deepseek-v3.1:671b-cloud', 671],
    ['', 'kimi-k3', null],
    ['', 'phi3:mini', null],
]) eq(`parseParamSizeB(${JSON.stringify(size)}, ${name})`, parseParamSizeB(size, name), want);

eq('isSmallModel 3.2', isSmallModel(3.2), true);
eq('isSmallModel 19.9', isSmallModel(19.9), true);
eq('isSmallModel 20', isSmallModel(20), false);
eq('isSmallModel null (unknown is not small)', isSmallModel(null), false);

eq('0.40.4 > 0.5.0', compareVersions('0.40.4', MIN_OLLAMA_VERSION), 1);
eq('0.5.0 = 0.5.0', compareVersions('0.5.0', '0.5.0'), 0);
eq('0.4.9 < 0.5.0', compareVersions('0.4.9', MIN_OLLAMA_VERSION), -1);
eq('0.5.0-rc1 = 0.5.0 (numeric parts only)', compareVersions('0.5.0-rc1', '0.5.0'), 0);

eq('filterChatModels drops embedding-only, keeps missing capabilities', filterChatModels([
    { name: 'chat', capabilities: ['completion', 'tools'] },
    { name: 'embed', capabilities: ['embedding'] },
    { name: 'legacy' },
]).map(m => m.name), ['chat', 'legacy']);

const local = { target: 'local', path: '/api/chat' };
const cloud = { target: 'cloud', path: '/api/chat' };
const kind = (resp, ctx) => classifyFailure(resp, ctx).kind;
eq('aborted', kind({ ok: false, status: 0, aborted: true }, local), 'aborted');
eq('timeout', kind({ ok: false, status: 0, timedOut: true }, local), 'timeout');
eq('no ipc', kind({ ok: false, status: 0, networkError: 'no_ipc' }, local), 'unavailable');
eq('network error', kind({ ok: false, status: 0, networkError: 'ECONNREFUSED' }, local), 'unreachable');
eq('401 cloud → unauthorized', kind({ ok: false, status: 401, json: { error: 'Unauthorized' } }, cloud), 'unauthorized');
eq('401 local → signin_required', kind({ ok: false, status: 401 }, local), 'signin_required');
eq('404 model → model_not_found', kind({ ok: false, status: 404, json: { error: "model 'x:1b' not found" } }, local), 'model_not_found');
eq('404 other → unsupported_version', kind({ ok: false, status: 404, text: '404 page not found' }, { target: 'local', path: '/api/version' }), 'unsupported_version');
eq('429', kind({ ok: false, status: 429 }, cloud), 'rate_limited');
eq('400', kind({ ok: false, status: 400, json: { error: 'invalid character' } }, local), 'bad_request');
eq('502', kind({ ok: false, status: 502 }, cloud), 'server');
eq('detail keeps Ollama message', classifyFailure({ ok: false, status: 400, json: { error: 'boom' } }, local).detail, 'boom');

eq('extractJson plain', extractJson('{"a":1}'), { value: { a: 1 }, repaired: null });
eq('extractJson fenced', extractJson('```json\n{\n "a": 1\n}\n```'), { value: { a: 1 }, repaired: 'fence' });
eq('extractJson fenced, no language, CRLF', extractJson('```\r\n{"a":1}\r\n```\r\n'), { value: { a: 1 }, repaired: 'fence' });
eq('extractJson prose-wrapped', extractJson('Вот план: {"a":[1,2]} Готово.'), { value: { a: [1, 2] }, repaired: 'slice' });
eq('extractJson BOM', extractJson('\uFEFF{"a":1}'), { value: { a: 1 }, repaired: null });
check('extractJson truncated → error', 'error' in extractJson('{"a": 1, "b"'));
check('extractJson prose → error', 'error' in extractJson('нет json'));

// ---- 2. provider with a fake transport ---------------------------------------------------------------
function fakeTransport(routes) {
    const calls = [];
    return {
        calls,
        async request(req) {
            calls.push(req);
            const handler = routes[req.path];
            if (!handler) return { ok: false, status: 404, text: 'nope' };
            return handler(req);
        },
    };
}
const ok = json => ({ ok: true, status: 200, json });
const TAGS = { models: [
    { name: 'big:120b-cloud', details: { parameter_size: '116.8B' }, capabilities: ['completion', 'tools'] },
    { name: 'tiny:3b', details: { parameter_size: '3.2B' }, capabilities: ['completion'] },
    { name: 'embed-model', capabilities: ['embedding'] },
    { name: 'mid:31b-cloud', details: { parameter_size: '' }, capabilities: ['completion'] },
] };

{
    const t = fakeTransport({ '/api/tags': () => ok(TAGS) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: '' }, t);
    const models = await p.listModels();
    eq('provider: embedding-only model filtered', models.map(m => m.name), ['big:120b-cloud', 'mid:31b-cloud', 'tiny:3b']);
    eq('provider: small flags (empty parameter_size falls back to name)', models.map(m => m.small), [false, false, true]);
    eq('provider: local request carries baseUrl', t.calls[0].baseUrl, 'http://h:1');
}
{
    const t = fakeTransport({ '/api/tags': () => ok(TAGS) });
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: 'http://ignored:1', model: 'tiny:3b' }, t);
    const r = await p.testConnection();
    eq('provider cloud test: ok + small warning', [r.ok, r.warnings, r.modelCount, r.selectedModelFound], [true, ['small_model'], 3, true]);
    check('provider cloud test: no /api/version call', !t.calls.some(c => c.path === '/api/version'));
    check('provider cloud test: baseUrl not sent', t.calls.every(c => c.baseUrl === undefined && c.target === 'cloud'));
}
{
    const t = fakeTransport({ '/api/version': () => ok({ version: '0.4.0' }), '/api/tags': () => ok(TAGS) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: '' }, t);
    const r = await p.testConnection();
    eq('provider local test: old version + no model warnings', [r.ok, r.version, r.warnings, r.selectedModelFound], [true, '0.4.0', ['old_version', 'no_model_selected'], null]);
}
{
    const t = fakeTransport({ '/api/version': () => ok({ version: '0.40.4' }), '/api/tags': () => ok(TAGS) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: 'gone:7b' }, t);
    const r = await p.testConnection();
    eq('provider local test: missing model reported', [r.ok, r.selectedModelFound], [true, false]);
}
{
    const t = fakeTransport({ '/api/version': () => ({ ok: false, status: 0, networkError: 'ECONNREFUSED' }) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: 'x' }, t);
    const r = await p.testConnection();
    eq('provider local test: daemon down → unreachable', [r.ok, r.error?.kind], [false, 'unreachable']);
}
{
    const t = fakeTransport({ '/api/version': () => ({ ok: false, status: 404, text: '404 page not found' }) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: 'x' }, t);
    const r = await p.testConnection();
    eq('provider local test: no /api/version → unsupported_version', r.error?.kind, 'unsupported_version');
}
{
    const t = fakeTransport({ '/api/tags': () => ok({ nope: 1 }) });
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: '', model: '' }, t);
    await rejects('provider: tags without models array → bad_response', () => p.listModels(), 'bad_response');
}
{
    const t = fakeTransport({});
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: '' }, t);
    await rejects('provider: chat without model throws', () => p.chat({ messages: [] }), 'model_not_found');
    check('provider: chat without model sends nothing', t.calls.length === 0);
}
{
    const t = fakeTransport({ '/api/chat': req => ok({ message: { role: 'assistant', content: '{"a":1}', thinking: 'hm' }, echo: req.body }) });
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: '', model: 'gpt-oss:120b' }, t);
    const schema = { type: 'object' };
    const r = await p.chat({ messages: [{ role: 'user', content: 'hi' }], format: schema, options: { temperature: 0 }, think: 'low' });
    const body = t.calls[0].body;
    eq('provider chat: body', [body.model, body.stream, body.format, body.think, body.options], ['gpt-oss:120b', false, schema, 'low', { temperature: 0, num_ctx: 16384 }]);
    eq('provider chat: result', [r.message.content, r.message.thinking, typeof r.latencyMs], ['{"a":1}', 'hm', 'number']);
    check('provider chat: tools/format omitted when not given', !('tools' in body));
    check('provider chat: never puts credentials in the request', !JSON.stringify(t.calls[0]).toLowerCase().includes('authorization'));
}
for (const [url, want] of [
    ['http://localhost:11434', true], ['http://127.0.0.1:11434', true], ['http://127.1.2.3', true], ['http://[::1]:11434', true],
    ['http://ollama.localhost:11434', true], ['http://192.168.1.20:11434', false], ['https://example.com', false],
    ['http://localhost.evil.com', false], ['http://127.0.0.1.evil.com', false], ['not a url', false],
]) eq(`isLoopbackUrl(${url})`, isLoopbackUrl(url), want);
eq('hostOf', [hostOf('http://[::1]:11434'), hostOf('https://Example.com:8080/x'), hostOf('nope')], ['::1', 'example.com', null]);
eq('num_ctx: a small prompt stays on the measured 16384', [neededNumCtx(0), neededNumCtx(5000), neededNumCtx(28000)], [16384, 16384, 16384]);
eq('num_ctx: grows in 2048 steps once the prompt (+2048 answer tokens) no longer fits', [neededNumCtx(28673), neededNumCtx(40000)], [18432, 22528]);
eq('num_ctx: capped at 65536', neededNumCtx(10_000_000), 65536);
{
    const t = fakeTransport({ '/api/chat': req => ok({ message: { role: 'assistant', content: '{}' }, echo: req.body }) });
    const p = createOllamaProvider({ mode: 'local', baseUrl: 'http://h:1', model: 'm' }, t);
    await p.chat({ messages: [{ role: 'system', content: 'я'.repeat(40000) }, { role: 'user', content: 'привет' }], format: { type: 'object' } });
    eq('provider chat: a large prompt raises num_ctx', t.calls[0].body.options.num_ctx, 22528);
    await p.chat({ messages: [{ role: 'user', content: 'x' }], options: { num_ctx: 4096 } });
    eq('provider chat: an explicit num_ctx still wins', t.calls[1].body.options.num_ctx, 4096);
}
{
    const t = fakeTransport({ '/api/chat': () => ok({}) });
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: '', model: 'm' }, t);
    await rejects('provider: chat response without message → bad_response', () => p.chat({ messages: [] }), 'bad_response');
}
{
    const t = fakeTransport({ '/api/chat': () => ({ ok: false, status: 401, json: { error: 'Unauthorized' } }) });
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: '', model: 'm' }, t);
    await rejects('provider: cloud 401 → unauthorized', () => p.chat({ messages: [] }), 'unauthorized');
}

// ---- 3. electron/ai-bridge.cjs with fake electron objects ---------------------------------------------
{
    const { createRequire } = await import('node:module');
    const fs = await import('node:fs');
    const os = await import('node:os');
    const path = await import('node:path');
    const { registerAiIpc } = createRequire(import.meta.url)('../electron/ai-bridge.cjs');

    const userData = fs.mkdtempSync(path.join(os.tmpdir(), 'deckify-ai-check-'));
    const KEY = 'sk-test-0123456789abcdef';
    let encryptionAvailable = true;
    const safeStorage = {
        isEncryptionAvailable: () => encryptionAvailable,
        getSelectedStorageBackend: () => 'gnome_libsecret',
        // Not real encryption — just reversible and visibly different from the plaintext.
        encryptString: s => Buffer.from('ENC:' + Buffer.from(s).toString('base64')),
        decryptString: b => {
            const t = b.toString();
            if (!t.startsWith('ENC:')) throw new Error('cannot decrypt');
            return Buffer.from(t.slice(4), 'base64').toString();
        },
    };

    const fetchCalls = [];
    let fetchImpl = async () => new Response(JSON.stringify({ ok: true }), { status: 200 });
    const net = { fetch: (url, init) => { fetchCalls.push({ url, init }); return fetchImpl(url, init); } };

    function boot() {
        const handlers = new Map();
        const listeners = new Map();
        registerAiIpc({
            app: { getPath: () => userData },
            ipcMain: { handle: (ch, fn) => handlers.set(ch, fn), on: (ch, fn) => listeners.set(ch, fn) },
            net,
            safeStorage,
        });
        return { call: (ch, ...a) => handlers.get(ch)({}, ...a), send: (ch, ...a) => listeners.get(ch)({}, ...a) };
    }
    const keyFile = path.join(userData, 'ai-key.bin');
    let ipc = boot();
    let n = 0;
    const req = (over) => ({ id: `r${++n}`, target: 'local', baseUrl: 'http://127.0.0.1:11434', path: '/api/tags', method: 'GET', ...over });

    eq('bridge: key status empty at start', await ipc.call('ai:key-status'), { hasKey: false, storage: 'none', problem: undefined });

    for (const [name, over] of [
        ['unknown path', { path: '/api/delete', method: 'POST' }],
        ['method not matching path', { path: '/api/chat', method: 'GET' }],
        ['non-http baseUrl', { baseUrl: 'file:///etc/passwd' }],
        ['baseUrl with credentials', { baseUrl: 'http://u:p@127.0.0.1:11434' }],
        ['missing baseUrl for local', { baseUrl: undefined }],
        ['unknown target', { target: 'elsewhere' }],
        ['empty id', { id: '' }],
    ]) {
        const before = fetchCalls.length;
        const r = await ipc.call('ai:request', req(over));
        check(`bridge rejects ${name} without a network call`, r.ok === false && r.status === 400 && fetchCalls.length === before, JSON.stringify(r));
    }

    let st = await ipc.call('ai:key-set', `  ${KEY}\n`);
    eq('bridge: key stored in keychain mode', [st.hasKey, st.storage], [true, 'keychain']);
    check('bridge: status never contains the key', !JSON.stringify(st).includes(KEY));
    check('bridge: key file is not plaintext', fs.existsSync(keyFile) && !fs.readFileSync(keyFile).toString().includes(KEY));

    fetchCalls.length = 0;
    await ipc.call('ai:request', req({ target: 'cloud', baseUrl: 'http://evil.example', path: '/api/chat', method: 'POST', body: { model: 'm' } }));
    eq('bridge: cloud chat goes to ollama.com (renderer baseUrl ignored)', fetchCalls[0].url, 'https://ollama.com/api/chat');
    eq('bridge: cloud chat carries the key', fetchCalls[0].init.headers.Authorization, `Bearer ${KEY}`);
    eq('bridge: redirects are refused', fetchCalls[0].init.redirect, 'error');
    eq('bridge: body is serialized', fetchCalls[0].init.body, '{"model":"m"}');

    fetchCalls.length = 0;
    await ipc.call('ai:request', req({ target: 'cloud', path: '/api/tags' }));
    check('bridge: cloud model listing carries no key', fetchCalls[0].init.headers.Authorization === undefined);
    await ipc.call('ai:request', req({ target: 'local', baseUrl: 'http://127.0.0.1:11434/api/', path: '/api/chat', method: 'POST', body: {} }));
    eq('bridge: local chat url built from baseUrl', fetchCalls[1].url, 'http://127.0.0.1:11434/api/api/chat');
    check('bridge: local chat never carries the key', fetchCalls[1].init.headers.Authorization === undefined);

    fetchImpl = async () => new Response('plain text', { status: 502 });
    let r = await ipc.call('ai:request', req({ target: 'cloud', path: '/api/tags' }));
    eq('bridge: non-JSON error body returned as text', [r.ok, r.status, r.json, r.text], [false, 502, undefined, 'plain text']);
    fetchImpl = async () => new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401 });
    r = await ipc.call('ai:request', req({ target: 'cloud', path: '/api/chat', method: 'POST', body: {} }));
    eq('bridge: JSON error body parsed', [r.status, r.json], [401, { error: 'Unauthorized' }]);

    fetchImpl = async () => { const e = new TypeError('net::ERR_CONNECTION_REFUSED'); throw e; };
    r = await ipc.call('ai:request', req());
    eq('bridge: network failure reported', [r.ok, r.status, r.networkError], [false, 0, 'net::ERR_CONNECTION_REFUSED']);

    const hang = (_url, init) => new Promise((_, reject) => init.signal.addEventListener('abort', () => reject(new Error('aborted by signal'))));
    fetchImpl = hang;
    const pending = ipc.call('ai:request', req({ id: 'to-abort', path: '/api/chat', method: 'POST', body: {} }));
    await new Promise(res => setTimeout(res, 20));
    ipc.send('ai:abort', 'to-abort');
    r = await pending;
    eq('bridge: ai:abort cancels the request', [r.ok, r.aborted], [false, true]);
    // AbortSignal.timeout() timers are unref'd; Electron's event loop stays alive on its own, this script's does not.
    const keepAlive = setInterval(() => {}, 100);
    r = await ipc.call('ai:request', req({ timeoutMs: 1 })); // clamped to the 1 s minimum
    clearInterval(keepAlive);
    eq('bridge: timeout reported', [r.ok, r.timedOut], [false, true]);
    fetchImpl = async () => new Response('{}', { status: 200 });

    ipc = boot(); // simulates an app restart: state must come from the file
    st = await ipc.call('ai:key-status');
    eq('bridge: key survives restart', [st.hasKey, st.storage], [true, 'keychain']);
    fetchCalls.length = 0;
    await ipc.call('ai:request', req({ target: 'cloud', path: '/api/chat', method: 'POST', body: {} }));
    eq('bridge: restarted instance still sends the key', fetchCalls[0].init.headers.Authorization, `Bearer ${KEY}`);

    fs.writeFileSync(keyFile, 'garbage that is not ours');
    ipc = boot();
    st = await ipc.call('ai:key-status');
    eq('bridge: undecryptable key file → decrypt_failed, file removed', [st.hasKey, st.problem, fs.existsSync(keyFile)], [false, 'decrypt_failed', false]);

    encryptionAvailable = false;
    st = await ipc.call('ai:key-set', KEY);
    eq('bridge: no OS encryption → session-only, nothing on disk', [st.hasKey, st.storage, st.problem, fs.existsSync(keyFile)], [true, 'session', undefined, false]);
    encryptionAvailable = true;

    st = await ipc.call('ai:key-clear');
    eq('bridge: clear removes key and file', [st.hasKey, fs.existsSync(keyFile)], [false, false]);
    st = await ipc.call('ai:key-set', '   ');
    eq('bridge: blank key clears', st.hasKey, false);

    fs.rmSync(userData, { recursive: true, force: true });
}

// ---- 4. live: real local daemon and public ollama.com/api/tags ----------------------------------------
const fetchTransport = {
    async request(req) {
        const base = req.target === 'cloud' ? CLOUD_URL : req.baseUrl;
        try {
            const res = await fetch(base + req.path, {
                method: req.method,
                headers: { 'Content-Type': 'application/json' },
                body: req.body === undefined ? undefined : JSON.stringify(req.body),
                signal: AbortSignal.timeout(req.timeoutMs ?? 30_000),
            });
            const text = await res.text();
            let json;
            try { json = JSON.parse(text); } catch { /* not JSON */ }
            return { ok: res.ok, status: res.status, json, text };
        } catch (e) {
            return { ok: false, status: 0, networkError: String(e?.cause?.code ?? e?.message ?? e) };
        }
    },
};

const daemonUp = (await fetchTransport.request({ target: 'local', baseUrl: DEFAULT_LOCAL_URL, path: '/api/version', method: 'GET', timeoutMs: 2000 })).ok;
if (daemonUp) {
    const p = createOllamaProvider({ mode: 'local', baseUrl: DEFAULT_LOCAL_URL, model: '' }, fetchTransport);
    const r = await p.testConnection();
    check('live local: testConnection ok', r.ok && !!r.version && r.modelCount > 0, JSON.stringify(r));
    const models = await p.listModels();
    check('live local: models listed with names', models.length > 0 && models.every(m => m.name));
    const bad = createOllamaProvider({ mode: 'local', baseUrl: DEFAULT_LOCAL_URL, model: 'definitely-not-installed:1b' }, fetchTransport);
    await rejects('live local: unknown model → model_not_found', () => bad.chat({ messages: [{ role: 'user', content: 'hi' }], timeoutMs: 15_000 }), 'model_not_found');
    const down = createOllamaProvider({ mode: 'local', baseUrl: 'http://127.0.0.1:1', model: '' }, fetchTransport);
    const rd = await down.testConnection();
    eq('live local: closed port → unreachable', [rd.ok, rd.error?.kind], [false, 'unreachable']);
} else {
    console.log('skip live local checks: no Ollama on ' + DEFAULT_LOCAL_URL);
}

const cloudTags = await fetchTransport.request({ target: 'cloud', path: '/api/tags', method: 'GET', timeoutMs: 8000 });
if (cloudTags.ok) {
    const p = createOllamaProvider({ mode: 'cloud', baseUrl: '', model: '' }, fetchTransport);
    const models = await p.listModels();
    check('live cloud: public /api/tags lists models without a key', models.length > 0);
} else {
    console.log('skip live cloud check: ollama.com unreachable');
}

console.log(`\n${passed} passed, ${failed} failed`);
console.log(failed ? 'SOME CHECKS FAILED' : 'all checks passed');
process.exit(failed ? 1 : 0);
