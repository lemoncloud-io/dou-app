import { useCallback, useState } from 'react';

import type { ChatSendPayload } from '@lemoncloud/chatic-sockets-api';

import type { DomainChat } from '@chatic/data';
import { useRepositories } from '@chatic/app-runtime';

/**
 * Tracer-bullet send. Posts a message through the engine's chat repository,
 * which handles optimistic insertion + socket dispatch. Read receipts and
 * delete are deferred to a later phase.
 */
export const useChatMutations = () => {
    const { chat: chatRepository } = useRepositories();
    const [isSending, setIsSending] = useState(false);

    const sendMessage = useCallback(
        (payload: ChatSendPayload): Promise<DomainChat> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            setIsSending(true);
            return chatRepository.sendChat(payload).finally(() => setIsSending(false));
        },
        [chatRepository]
    );

    // Resend a failed message: drop the failed optimistic record, then send its
    // content fresh so it re-enters the normal pending → sent flow.
    const retryMessage = useCallback(
        (message: DomainChat): Promise<DomainChat> => {
            if (!message.channelId || !message.content) {
                return Promise.reject(new Error('cannot retry a message without channel/content'));
            }
            const staleId = message.id ?? message.tempId;
            if (staleId) void chatRepository.cacheDelete(staleId);
            setIsSending(true);
            return chatRepository
                .sendChat({ channelId: message.channelId, content: message.content })
                .finally(() => setIsSending(false));
        },
        [chatRepository]
    );

    return { sendMessage, retryMessage, isSending };
};
