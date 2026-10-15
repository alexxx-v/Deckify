export type JsonRepair = 'fence' | 'slice' | null;

export type ExtractResult = { value: unknown; repaired: JsonRepair } | { error: string };

const FENCE_RE = /^\s*```[a-zA-Z0-9_-]*[ \t]*\r?\n?([\s\S]*?)\r?\n?[ \t]*```\s*$/;

function tryParse(text: string): { value: unknown } | null {
    try {
        return { value: JSON.parse(text) };
    } catch {
        return null;
    }
}

/**
 * Pulls a JSON value out of model output. Models behind `format` sometimes ignore it and wrap the
 * JSON in a markdown fence or a sentence (gemma4:31b-cloud did so in 30/30 spike runs). Only those two
 * wrappers are undone; the content itself is never altered. `repaired` says which one was needed.
 */
export function extractJson(text: string): ExtractResult {
    const raw = text.replace(/^\uFEFF/, '');
    const direct = tryParse(raw);
    if (direct) return { value: direct.value, repaired: null };

    const fenced = FENCE_RE.exec(raw);
    if (fenced) {
        const parsed = tryParse(fenced[1]);
        if (parsed) return { value: parsed.value, repaired: 'fence' };
    }

    const starts = ['{', '['].map(c => raw.indexOf(c)).filter(i => i >= 0);
    if (starts.length) {
        const start = Math.min(...starts);
        const end = raw.lastIndexOf(raw[start] === '{' ? '}' : ']');
        if (end > start) {
            const parsed = tryParse(raw.slice(start, end + 1));
            if (parsed) return { value: parsed.value, repaired: 'slice' };
        }
    }
    return { error: 'no valid JSON found in model output' };
}
