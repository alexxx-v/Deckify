import type { AiMode, ModelInfo, TransportResponse } from './types.ts';
import { AiError } from './types.ts';

export const DEFAULT_LOCAL_URL = 'http://localhost:11434';
export const CLOUD_URL = 'https://ollama.com';
/** Models below this many billion parameters get a quality warning in Settings. */
export const SMALL_MODEL_THRESHOLD_B = 20;
/** First Ollama release with JSON-schema structured outputs (`format`). */
export const MIN_OLLAMA_VERSION = '0.5.0';

/** `localhost:11434` → `http://localhost:11434`; strips a trailing `/` or `/api`. null when unusable. */
export function normalizeBaseUrl(input: string): string | null {
    let value = input.trim();
    if (!value) return null;
    if (!/^[a-z][a-z0-9+.-]*:\/\//i.test(value)) value = `http://${value}`;
    let url: URL;
    try {
        url = new URL(value);
    } catch {
        return null;
    }
    if (url.protocol !== 'http:' && url.protocol !== 'https:') return null;
    if (url.username || url.password) return null;
    const path = url.pathname.replace(/\/+$/, '').replace(/\/api$/, '');
    return `${url.origin}${path}`;
}

const SIZE_UNITS: Record<string, number> = { K: 1e-6, M: 1e-3, B: 1, T: 1e3 };
const NAME_SIZE_RE = /(?:^|[:_.-])e?(\d+(?:\.\d+)?)b(?=$|[:_.-])/i;

/**
 * Parameter count in billions. `details.parameter_size` ("116.8B", "270M") wins; it is often empty
 * for cloud models, so fall back to the size in the name ("gemma4:31b-cloud"). Unknown → null.
 */
export function parseParamSizeB(parameterSize: string | undefined, name: string): number | null {
    const m = /^\s*(\d+(?:\.\d+)?)\s*([KMBT])/i.exec(parameterSize ?? '');
    if (m) return Number(m[1]) * SIZE_UNITS[m[2].toUpperCase()];
    const fromName = NAME_SIZE_RE.exec(name);
    return fromName ? Number(fromName[1]) : null;
}

/** Unknown size is never "small": a missing size must not produce a false warning. */
export function isSmallModel(sizeB: number | null): boolean {
    return sizeB !== null && sizeB < SMALL_MODEL_THRESHOLD_B;
}

/** -1 / 0 / 1 comparing the numeric parts of two versions ("0.40.4" vs "0.5.0"). */
export function compareVersions(a: string, b: string): number {
    const parts = (v: string) => v.split(/[.+-]/).slice(0, 3).map(p => parseInt(p, 10) || 0);
    const pa = parts(a);
    const pb = parts(b);
    for (let i = 0; i < 3; i++) {
        const d = (pa[i] ?? 0) - (pb[i] ?? 0);
        if (d !== 0) return d < 0 ? -1 : 1;
    }
    return 0;
}

export interface TagsEntry {
    name?: string;
    model?: string;
    details?: { parameter_size?: string };
    capabilities?: string[];
}

/** Drops embedding-only models; entries without a `capabilities` field are kept. */
export function filterChatModels(entries: TagsEntry[]): TagsEntry[] {
    return entries.filter(e => !e.capabilities || e.capabilities.includes('completion'));
}

export function toModelInfo(entry: TagsEntry): ModelInfo {
    const name = entry.name ?? entry.model ?? '';
    const sizeB = parseParamSizeB(entry.details?.parameter_size, name);
    return { name, sizeB, small: isSmallModel(sizeB), capabilities: entry.capabilities ?? [] };
}

function errorText(resp: TransportResponse): string | undefined {
    const json = resp.json as { error?: unknown } | undefined;
    if (json && typeof json.error === 'string') return json.error;
    return resp.text?.trim() ? resp.text.trim().slice(0, 300) : undefined;
}

/** Maps a failed transport response to an AiError. Ollama's own message is kept as `detail`. */
export function classifyFailure(resp: TransportResponse, ctx: { target: AiMode; path: string }): AiError {
    if (resp.aborted) return new AiError('aborted');
    if (resp.timedOut) return new AiError('timeout');
    if (resp.networkError === 'no_ipc') return new AiError('unavailable');
    if (resp.networkError) return new AiError('unreachable', resp.networkError);

    const detail = errorText(resp);
    const { status } = resp;
    // Cloud models through a local daemon need `ollama signin`; we assume the daemon answers 401/403.
    if (status === 401 || status === 403) {
        return new AiError(ctx.target === 'cloud' ? 'unauthorized' : 'signin_required', detail);
    }
    if (status === 404) {
        if (detail && /model\b.*not found/i.test(detail)) return new AiError('model_not_found', detail);
        return new AiError('unsupported_version', detail);
    }
    if (status === 429) return new AiError('rate_limited', detail);
    if (status === 400) return new AiError('bad_request', detail);
    if (status >= 500) return new AiError('server', detail);
    return new AiError('bad_response', detail ?? `HTTP ${status}`);
}
