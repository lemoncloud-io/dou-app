import { useCallback } from 'react';

import type { ChatSendInput } from '@lemoncloud/chatic-sockets-api';

import { RELAY_CLOUD_ID } from '@chatic/data';
import type { DomainChat } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { getChatOutbox, toSendPayload } from './useChatOutbox';

/**
 * Message send/retry/discard through the engine's chat repository, which
 * handles optimistic insertion + socket dispatch. Sends are NOT serialized —
 * the optimistic row is the feedback, and a slow ack must not block the next
 * message; per-message state lives on the rows themselves (isPending/isFailed).
 *
 * Send, retry and discard are addressed to a cloud the caller names — the channel's own — rather
 * than to whichever cloud is selected when the write lands. The app graph resolves its
 * partition and its socket at different moments, so a cloud switch between the two put
 * the optimistic row in one cloud and the message on another cloud's socket.
 */
export const useChatMutations = () => {
    // `cid` is captured when the user presses send, so the message goes where it was written.
    const sendMessage = useCallback((cid: string, payload: ChatSendInput): Promise<DomainChat> => {
        if (!payload.channelId) return Promise.reject(new Error('channelId is required'));
        if (!payload.content) return Promise.reject(new Error('content is required'));

        return runtime.data.sendChatInCloud(cid, payload);
    }, []);

    // Resend a failed message: drop the failed optimistic record, then send its
    // content fresh so it re-enters the normal pending → sent flow. Both go to the
    // message's own cloud — its row is in that partition, whichever cloud is on screen.
    const retryMessage = useCallback(async (message: DomainChat): Promise<DomainChat> => {
        const { content } = message;
        if (!message.channelId || !content) {
            throw new Error('cannot retry a message without channel/content');
        }
        const cid = message.cid || RELAY_CLOUD_ID;
        const staleId = message.id ?? message.tempId;
        if (staleId) {
            // A reconnect sweep may already hold this row; drop its queue entry so the button
            // and the outbox don't both send it.
            getChatOutbox()?.remove(staleId);
            // Awaited, as the outbox's own resend does: the failed bubble is gone before the
            // new pending one appears, and a delete that fails stops the resend rather than
            // leaving two rows for one message — the failed row keeps its retry button, so
            // the user can press it again, while a second failure would strand a duplicate.
            await runtime.data.getCloudRepositories(cid).chat.cacheDelete(staleId);
        }
        // Same payload the outbox builds — the manual button and the automatic resend must
        // put the identical message on the wire. They had drifted: this path used to drop
        // `contentType`, so retrying a non-text message re-sent it as plain text.
        return runtime.data.sendChatInCloud(cid, toSendPayload({ ...message, content }));
    }, []);

    // Remove an unsent (failed / stuck-pending) message. These rows exist only in
    // the local cache — the server has no record — so a cache delete IS the delete. It
    // goes to the message's own cloud, like the retry: that is the partition the row is
    // in, and mid-switch the selection is already the next cloud's.
    const discardMessage = useCallback((message: DomainChat): Promise<void> => {
        const staleId = message.id ?? message.tempId;
        if (!staleId) return Promise.resolve();
        // Discarding is the user saying "don't send this" — retire any queued entry too.
        getChatOutbox()?.remove(staleId);
        return runtime.data.getCloudRepositories(message.cid || RELAY_CLOUD_ID).chat.cacheDelete(staleId);
    }, []);

    return { sendMessage, retryMessage, discardMessage };
};
