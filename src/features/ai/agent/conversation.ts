import { useSyncExternalStore } from 'react';
import { createConversationStore } from './conversationState';
import type { ConversationState } from './conversationState';

/** The one conversation of the running app (module level: it outlives the chat window). */
export const conversation = createConversationStore();

export function useConversation(): ConversationState {
    return useSyncExternalStore(conversation.subscribe, conversation.getState);
}
