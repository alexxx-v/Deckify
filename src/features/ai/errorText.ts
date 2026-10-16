import type { AiErrorKind, AiMode } from './types';

/** i18n key of the user-facing text for a provider error (texts live under settings.ai.errors). */
export function aiErrorKey(kind: AiErrorKind, mode: AiMode): string {
    return `settings.ai.errors.${kind === 'unreachable' ? `unreachable_${mode}` : kind}`;
}
