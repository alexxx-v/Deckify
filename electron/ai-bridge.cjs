const fs = require('fs');
const path = require('path');

// Main-process side of the AI assistant: an allow-listed HTTP proxy to Ollama (local daemon or
// Ollama Cloud) and the store for the Ollama Cloud API key.
//
// Why main and not the renderer: one code path in dev (http://localhost:5173) and in the packaged app
// (file://) with no dependence on OLLAMA_ORIGINS/CORS, and the API key never reaches the renderer.
// The renderer still runs with nodeIntegration, so this is hygiene, not a security boundary.

const CLOUD_URL = 'https://ollama.com';

const ROUTES = {
    '/api/tags': { method: 'GET', timeoutMs: 10000 },
    '/api/version': { method: 'GET', timeoutMs: 10000 },
    '/api/chat': { method: 'POST', timeoutMs: 240000 },
};
const MAX_TIMEOUT_MS = 600000;
const MAX_TEXT_CHARS = 4000;

function registerAiIpc({ app, ipcMain, net, safeStorage }) {
    const keyFile = () => path.join(app.getPath('userData'), 'ai-key.bin');
    const controllers = new Map();

    // ---- API key ----------------------------------------------------------------------------------
    let key = null;
    let keyLoaded = false;
    let keyPersisted = false;
    let keyProblem = null;

    // On Linux without a keyring Electron silently falls back to a hardcoded password ('basic_text'),
    // which protects nothing — treat that as "cannot persist" and keep the key in memory only.
    const canPersist = () => {
        if (!safeStorage.isEncryptionAvailable()) return false;
        if (process.platform === 'linux' && safeStorage.getSelectedStorageBackend() === 'basic_text') return false;
        return true;
    };

    const removeKeyFile = () => {
        try {
            fs.unlinkSync(keyFile());
        } catch (err) {
            if (err.code !== 'ENOENT') console.error('Could not remove AI key file:', err.code);
        }
    };

    // Lazy: the first decrypt can make macOS show a Keychain prompt, so only do it when the key is needed.
    const loadKey = () => {
        if (keyLoaded) return;
        keyLoaded = true;
        if (!fs.existsSync(keyFile())) return;
        if (!canPersist()) {
            keyProblem = 'decrypt_failed';
            return;
        }
        try {
            key = safeStorage.decryptString(fs.readFileSync(keyFile()));
            keyPersisted = true;
        } catch {
            // e.g. an unsigned macOS build updated and the Keychain item no longer belongs to this app.
            keyProblem = 'decrypt_failed';
            removeKeyFile();
        }
    };

    const keyStatus = () => {
        loadKey();
        return {
            hasKey: !!key,
            storage: key ? (keyPersisted ? 'keychain' : 'session') : 'none',
            problem: keyProblem || undefined,
        };
    };

    const clearKey = () => {
        key = null;
        keyLoaded = true;
        keyPersisted = false;
        keyProblem = null;
        removeKeyFile();
        return keyStatus();
    };

    const setKey = (raw) => {
        // API keys contain no whitespace; dropping it also rules out header injection.
        const value = typeof raw === 'string' ? raw.replace(/\s+/g, '') : '';
        if (!value) return clearKey();
        key = value;
        keyLoaded = true;
        keyProblem = null;
        keyPersisted = false;
        if (canPersist()) {
            try {
                fs.writeFileSync(keyFile(), safeStorage.encryptString(value), { mode: 0o600 });
                keyPersisted = true;
            } catch (err) {
                console.error('Could not persist AI key:', err.code || 'encryption failed');
            }
        }
        if (!keyPersisted) removeKeyFile();
        return keyStatus();
    };

    ipcMain.handle('ai:key-status', () => keyStatus());
    ipcMain.handle('ai:key-set', (event, raw) => setKey(raw));
    ipcMain.handle('ai:key-clear', () => clearKey());

    // ---- HTTP proxy -------------------------------------------------------------------------------
    const resolveBase = (target, baseUrl) => {
        if (target === 'cloud') return CLOUD_URL; // a renderer-supplied URL is never used for the cloud
        if (target !== 'local' || typeof baseUrl !== 'string') return null;
        try {
            const url = new URL(baseUrl);
            if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
            if (url.username || url.password) return null;
            return url.origin + url.pathname.replace(/\/+$/, '');
        } catch {
            return null;
        }
    };

    ipcMain.handle('ai:request', async (event, req) => {
        const { id, target, baseUrl, path: apiPath, method, body, timeoutMs } = req || {};
        const route = ROUTES[apiPath];
        const base = resolveBase(target, baseUrl);
        if (typeof id !== 'string' || !id || !route || route.method !== method || !base) {
            return { ok: false, status: 400, text: 'invalid request' };
        }

        const headers = {};
        if (method === 'POST') headers['Content-Type'] = 'application/json';
        // The key goes only to ollama.com chat requests — never to a local URL, never on listing calls.
        if (target === 'cloud' && apiPath === '/api/chat') {
            loadKey();
            if (key) headers.Authorization = `Bearer ${key}`;
        }

        const limit = Number.isFinite(timeoutMs) ? Math.min(Math.max(timeoutMs, 1000), MAX_TIMEOUT_MS) : route.timeoutMs;
        const userAbort = new AbortController();
        const timeout = AbortSignal.timeout(limit);
        controllers.set(id, userAbort);
        try {
            const res = await net.fetch(base + apiPath, {
                method,
                headers,
                body: method === 'POST' ? JSON.stringify(body ?? {}) : undefined,
                signal: AbortSignal.any([userAbort.signal, timeout]),
                redirect: 'error', // the key must not follow a redirect to another host
            });
            const text = await res.text();
            let json;
            try {
                json = JSON.parse(text);
            } catch {
                json = undefined;
            }
            return {
                ok: res.ok,
                status: res.status,
                json,
                text: json === undefined ? text.slice(0, MAX_TEXT_CHARS) : undefined,
            };
        } catch (err) {
            if (userAbort.signal.aborted) return { ok: false, status: 0, aborted: true };
            if (timeout.aborted) return { ok: false, status: 0, timedOut: true };
            return { ok: false, status: 0, networkError: String((err && err.message) || err) };
        } finally {
            controllers.delete(id);
        }
    });

    ipcMain.on('ai:abort', (event, id) => {
        const controller = controllers.get(id);
        if (controller) controller.abort();
    });
}

module.exports = { registerAiIpc };
