// Modules in src/features/ai/ that scripts/ai-provider-check.mjs runs directly with Node's
// type stripping import each other with explicit `.ts` extensions and `import type`, and avoid
// enums / parameter properties (only erasable TypeScript syntax).

export type AiMode = 'local' | 'cloud';

export interface AiConfig {
    mode: AiMode;
    /** Used in `local` mode only; `cloud` always talks to https://ollama.com. */
    baseUrl: string;
    model: string;
}

export type ChatRole = 'system' | 'user' | 'assistant' | 'tool';

export interface ChatMessage {
    role: ChatRole;
    content: string;
    thinking?: string;
    tool_calls?: unknown[];
}

export interface ChatRequest {
    messages: ChatMessage[];
    /** JSON schema (or 'json'). A decoding constraint only — the model does not see it. */
    format?: object | 'json';
    tools?: unknown[];
    think?: boolean | 'low' | 'medium' | 'high';
    options?: Record<string, unknown>;
    signal?: AbortSignal;
    timeoutMs?: number;
}

export interface ChatResult {
    message: ChatMessage;
    latencyMs: number;
}

export interface ModelInfo {
    name: string;
    /** Parameters in billions, or null when neither the API nor the name tells. */
    sizeB: number | null;
    small: boolean;
    capabilities: string[];
}

export type AiErrorKind =
    | 'unavailable'
    | 'unreachable'
    | 'unauthorized'
    | 'signin_required'
    | 'model_not_found'
    | 'rate_limited'
    | 'server'
    | 'bad_request'
    | 'unsupported_version'
    | 'timeout'
    | 'aborted'
    | 'bad_response';

export class AiError extends Error {
    kind: AiErrorKind;
    /** Ollama's own `error` string, when there was one. */
    detail?: string;
    constructor(kind: AiErrorKind, detail?: string) {
        super(detail ? `${kind}: ${detail}` : kind);
        this.name = 'AiError';
        this.kind = kind;
        this.detail = detail;
    }
}

export type AiPath = '/api/tags' | '/api/version' | '/api/chat';

export interface TransportRequest {
    target: AiMode;
    baseUrl?: string;
    path: AiPath;
    method: 'GET' | 'POST';
    body?: unknown;
    timeoutMs?: number;
    signal?: AbortSignal;
}

export interface TransportResponse {
    ok: boolean;
    status: number;
    json?: unknown;
    text?: string;
    networkError?: string;
    timedOut?: boolean;
    aborted?: boolean;
}

export interface AiTransport {
    request(req: TransportRequest): Promise<TransportResponse>;
}

export type ConnectionWarning = 'old_version' | 'small_model' | 'no_model_selected';

export interface ConnectionReport {
    ok: boolean;
    version?: string;
    modelCount: number;
    /** null when no model is selected. */
    selectedModelFound: boolean | null;
    warnings: ConnectionWarning[];
    error?: AiError;
}

export interface AiProvider {
    listModels(): Promise<ModelInfo[]>;
    testConnection(): Promise<ConnectionReport>;
    chat(req: ChatRequest): Promise<ChatResult>;
}
