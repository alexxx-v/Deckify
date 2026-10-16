import { v4 as uuidv4 } from 'uuid';
import type { AiTransport, TransportRequest, TransportResponse } from './types';

interface IpcRenderer {
    invoke(channel: string, ...args: unknown[]): Promise<unknown>;
    send(channel: string, ...args: unknown[]): void;
}

export interface KeyStatus {
    hasKey: boolean;
    storage: 'keychain' | 'session' | 'none';
    problem?: 'decrypt_failed';
}

/** The app has no preload script (nodeIntegration), so the renderer reaches Electron through window.require. */
function getIpc(): IpcRenderer | null {
    if (typeof window === 'undefined' || !('require' in window)) return null;
    try {
        const { ipcRenderer } = (window as unknown as { require(id: string): { ipcRenderer: IpcRenderer } }).require('electron');
        return ipcRenderer;
    } catch (err) {
        console.error('Could not load electron module:', err);
        return null;
    }
}

/** False in the browser-only `npm run dev`, where there is no main process to talk to. */
export function isAiAvailable(): boolean {
    return getIpc() !== null;
}

/** Sends Ollama requests through the main process (see electron/ai-bridge.cjs). */
export function createIpcTransport(): AiTransport {
    return {
        async request(req: TransportRequest): Promise<TransportResponse> {
            const ipc = getIpc();
            if (!ipc) return { ok: false, status: 0, networkError: 'no_ipc' };
            if (req.signal?.aborted) return { ok: false, status: 0, aborted: true };

            const id = uuidv4();
            const onAbort = () => ipc.send('ai:abort', id);
            req.signal?.addEventListener('abort', onAbort, { once: true });
            try {
                const resp = await ipc.invoke('ai:request', {
                    id,
                    target: req.target,
                    baseUrl: req.baseUrl,
                    path: req.path,
                    method: req.method,
                    body: req.body,
                    timeoutMs: req.timeoutMs,
                });
                return resp as TransportResponse;
            } catch (err) {
                return { ok: false, status: 0, networkError: String(err instanceof Error ? err.message : err) };
            } finally {
                req.signal?.removeEventListener('abort', onAbort);
            }
        },
    };
}

const NO_KEY: KeyStatus = { hasKey: false, storage: 'none' };

async function invokeKey(channel: string, ...args: unknown[]): Promise<KeyStatus> {
    const ipc = getIpc();
    if (!ipc) return NO_KEY;
    try {
        return (await ipc.invoke(channel, ...args)) as KeyStatus;
    } catch (err) {
        console.error('AI key store call failed:', err);
        return NO_KEY;
    }
}

/** The Ollama Cloud API key lives in the main process; the renderer can only set, clear and ask whether it exists. */
export const keyStore = {
    status: () => invokeKey('ai:key-status'),
    set: (key: string) => invokeKey('ai:key-set', key),
    clear: () => invokeKey('ai:key-clear'),
};
