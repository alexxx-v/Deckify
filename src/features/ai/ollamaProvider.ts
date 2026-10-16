import type {
    AiConfig, AiProvider, AiTransport, ChatRequest, ChatResult, ConnectionReport,
    ConnectionWarning, ModelInfo, TransportRequest, TransportResponse,
} from './types.ts';
import { AiError } from './types.ts';
import { BASE_NUM_CTX, MIN_OLLAMA_VERSION, classifyFailure, compareVersions, filterChatModels, neededNumCtx, toModelInfo } from './ollamaUtils.ts';
import type { TagsEntry } from './ollamaUtils.ts';

const META_TIMEOUT_MS = 10_000;
/** Same values the spike (scripts/ai-spike/run.mjs) ran with. */
const DEFAULT_OPTIONS = { temperature: 0.2, num_ctx: BASE_NUM_CTX };

/**
 * Ollama implementation of AiProvider. It only moves messages: prompts, schemas and plan parsing
 * belong to the callers (a `format` schema is a decoding constraint the model never sees, and
 * Ollama Cloud does not enforce it at all — see docs/plans/2026-10-13-ai-assistant-spike-results.md).
 */
/** Everything the model has to read: messages, the `format` schema and tool definitions. */
function promptChars(req: ChatRequest): number {
    const extra = (v: unknown) => (v === undefined ? 0 : JSON.stringify(v).length);
    return req.messages.reduce((n, m) => n + m.content.length, 0) + extra(req.format) + extra(req.tools);
}

export function createOllamaProvider(config: AiConfig, transport: AiTransport): AiProvider {
    const send = async (
        req: Pick<TransportRequest, 'path' | 'method' | 'body' | 'timeoutMs' | 'signal'>,
    ): Promise<TransportResponse> => {
        const resp = await transport.request({
            target: config.mode,
            baseUrl: config.mode === 'local' ? config.baseUrl : undefined,
            ...req,
        });
        if (!resp.ok) throw classifyFailure(resp, { target: config.mode, path: req.path });
        return resp;
    };

    const listModels = async (): Promise<ModelInfo[]> => {
        const resp = await send({ path: '/api/tags', method: 'GET', timeoutMs: META_TIMEOUT_MS });
        const models = (resp.json as { models?: unknown } | undefined)?.models;
        if (!Array.isArray(models)) throw new AiError('bad_response', 'no models array in /api/tags');
        return filterChatModels(models as TagsEntry[])
            .map(toModelInfo)
            .sort((a, b) => Number(a.small) - Number(b.small) || a.name.localeCompare(b.name));
    };

    const testConnection = async (): Promise<ConnectionReport> => {
        const warnings: ConnectionWarning[] = [];
        let version: string | undefined;
        try {
            // ollama.com does not document /api/version, so only a local daemon is asked.
            if (config.mode === 'local') {
                const resp = await send({ path: '/api/version', method: 'GET', timeoutMs: META_TIMEOUT_MS });
                const v = (resp.json as { version?: unknown } | undefined)?.version;
                if (typeof v === 'string') {
                    version = v;
                    if (compareVersions(v, MIN_OLLAMA_VERSION) < 0) warnings.push('old_version');
                }
            }
            const models = await listModels();
            let selectedModelFound: boolean | null = null;
            if (config.model) {
                const selected = models.find(m => m.name === config.model);
                selectedModelFound = !!selected;
                if (selected?.small) warnings.push('small_model');
            } else {
                warnings.push('no_model_selected');
            }
            return { ok: true, version, modelCount: models.length, selectedModelFound, warnings };
        } catch (e) {
            if (e instanceof AiError) return { ok: false, version, modelCount: 0, selectedModelFound: null, warnings, error: e };
            throw e;
        }
    };

    const chat = async (req: ChatRequest): Promise<ChatResult> => {
        if (!config.model) throw new AiError('model_not_found', 'no model selected');
        const body: Record<string, unknown> = {
            model: config.model,
            messages: req.messages,
            stream: false,
            options: { ...DEFAULT_OPTIONS, num_ctx: neededNumCtx(promptChars(req)), ...req.options },
        };
        if (req.format !== undefined) body.format = req.format;
        if (req.tools !== undefined) body.tools = req.tools;
        if (req.think !== undefined) body.think = req.think;

        const t0 = Date.now();
        const resp = await send({ path: '/api/chat', method: 'POST', body, timeoutMs: req.timeoutMs, signal: req.signal });
        const message = (resp.json as { message?: { role?: string; content?: unknown; thinking?: unknown; tool_calls?: unknown } } | undefined)?.message;
        if (!message || typeof message !== 'object') throw new AiError('bad_response', 'no message in /api/chat response');
        return {
            message: {
                role: 'assistant',
                content: typeof message.content === 'string' ? message.content : '',
                thinking: typeof message.thinking === 'string' ? message.thinking : undefined,
                tool_calls: Array.isArray(message.tool_calls) ? message.tool_calls : undefined,
            },
            latencyMs: Date.now() - t0,
        };
    };

    return { listModels, testConnection, chat };
}
