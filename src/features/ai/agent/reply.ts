/*
 * Ids are for the app and the model, not for the user. The prompt asks the model not to quote them, but it still
 * copies the id column of the context in a good share of list answers, so the displayed reply is cleaned
 * deterministically. The history keeps the original text.
 */

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
// The user asked for ids on purpose: leave the reply alone.
const WANTS_IDS = /\bid\b|идентификатор|uuid/i;

export function stripIds(reply: string, userText: string): string {
    if (WANTS_IDS.test(userText) || !new RegExp(UUID, 'i').test(reply)) return reply;
    return reply
        .replace(new RegExp(`[ \\t]*[(\\[]\\s*(?:id\\s*[:=]?\\s*)?${UUID}\\s*[)\\]]`, 'gi'), '')                 // «(id: …)», «(…)»
        .replace(new RegExp(`^([ \\t]*(?:[-*•]|\\d+[.)])?[ \\t]*)${UUID}[ \\t]*[:–—-][ \\t]*`, 'gim'), '$1')   // «- …: Название»
        .replace(new RegExp(`[ \\t]*,?[ \\t]*\\bid\\s*[:=]?\\s*${UUID}`, 'gi'), '')                               // «, id …»
        .replace(new RegExp(UUID, 'gi'), '')
        .replace(/[ \t]+$/gm, '');
}
