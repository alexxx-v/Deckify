import { DEFAULT_LOCAL_URL } from './ollamaUtils';
import type { AiConfig, AiMode } from './types';

const MODE_KEY = 'deckify_ai_mode';
const BASE_URL_KEY = 'deckify_ai_base_url';
// Local daemons list cloud models as "name-cloud", ollama.com lists them without the suffix,
// so the chosen model is remembered per mode. The API key is never stored here.
const modelKey = (mode: AiMode) => `deckify_ai_model_${mode}`;

export function loadAiConfig(): AiConfig {
    const mode: AiMode = localStorage.getItem(MODE_KEY) === 'cloud' ? 'cloud' : 'local';
    return {
        mode,
        baseUrl: localStorage.getItem(BASE_URL_KEY) || DEFAULT_LOCAL_URL,
        model: localStorage.getItem(modelKey(mode)) || '',
    };
}

/** `model` is stored for the mode in `patch.mode`, or for the current mode when the patch has none. */
export function saveAiConfig(patch: Partial<AiConfig>): AiConfig {
    if (patch.mode) localStorage.setItem(MODE_KEY, patch.mode);
    if (patch.baseUrl !== undefined) localStorage.setItem(BASE_URL_KEY, patch.baseUrl);
    if (patch.model !== undefined) {
        const mode = patch.mode ?? loadAiConfig().mode;
        localStorage.setItem(modelKey(mode), patch.model);
    }
    return loadAiConfig();
}
