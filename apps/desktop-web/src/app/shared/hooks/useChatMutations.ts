import { useCallback } from 'react';

import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import type { DomainChat } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { getChatOutbox, toSendPayload } from './useChatOutbox';

/**
 * Message send/retry/discard through the engine's chat repository, which
 * handles optimistic insertion + socket dispatch. Sends are NOT serialized —
 * the optimistic row is the feedback, and a slow ack must not block the next
 * message; per-message state lives on the rows themselves (isPending/isFailed).
 */
export const useChatMutations = () => {
    const { chat: chatRepository } = useRuntimeRepositories();

    const sendMessage = useCallback(
        (payload: ChatSendInput): Promise<DomainChat> => {
            if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
            if (!payload.content) return Promise.reject(new Error('content is required'));

            return chatRepository.sendChat(payload);
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
            // A reconnect sweep may already hold this row; drop its queue entry so the button
            // and the outbox don't both send it.
            if (staleId) getChatOutbox()?.remove(staleId);
            if (staleId) void chatRepository.cacheDelete(staleId);
            // Same payload the outbox builds — the manual button and the automatic resend must
            // put the identical message on the wire. They had drifted: this path used to drop
            // `contentType`, so retrying a non-text message re-sent it as plain text.
            return chatRepository.sendChat(toSendPayload(message));
        },
        [chatRepository]
    );

    // Remove an unsent (failed / stuck-pending) message. These rows exist only in
    // the local cache — the server has no record (and no chat-delete API anyway),
    // so a cache delete IS the delete.
    const discardMessage = useCallback(
        (message: DomainChat): Promise<void> => {
            const staleId = message.id ?? message.tempId;
            if (!staleId) return Promise.resolve();
            // Discarding is the user saying "don't send this" — retire any queued entry too.
            getChatOutbox()?.remove(staleId);
            return chatRepository.cacheDelete(staleId);
        },
        [chatRepository]
    );

    return { sendMessage, retryMessage, discardMessage };
};
