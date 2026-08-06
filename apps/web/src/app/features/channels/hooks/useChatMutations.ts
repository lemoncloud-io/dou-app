import { useCallback, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainChat, DomainJoin } from '@chatic/data';

interface SendMessageInput {
    channelId: string;
    content: string;
    /**
     * Thread-reply target: the root's FULL id `<channelId>:<chatNo>` — the server
     * resolves it and 404s on a bare chatNo (ADR-0008/0045). Omit for a top-level send.
     */
    parentId?: string;
}

interface ReadMessageInput {
    channelId: string;
    chatNo: number;
}

/**
 * Chat writes for the room: send (optimistic insert + socket dispatch via the
 * engine), advance the read cursor, and drop an unsent (failed/pending) message.
 * There is no server chat-delete API, so deleting an unsent row is a cache delete.
 */
export const useChatMutations = () => {
    const { chat: chatRepository, join: joinRepository } = useRuntimeRepositories();
    const [isSending, setIsSending] = useState(false);

    const sendMessage = useCallback(
        (payload: SendMessageInput): Promise<DomainChat> => {
            if (!payload.channelId || !payload.content) {
                return Promise.reject(new Error('channelId and content are required'));
            }
            setIsSending(true);
            return chatRepository.sendChat(payload).finally(() => setIsSending(false));
        },
        [chatRepository]
    );

    const readMessage = useCallback(
        (payload: ReadMessageInput): Promise<DomainJoin> => joinRepository.readChat(payload),
        [joinRepository]
    );

    const deleteMessage = useCallback(
        (messageId: string, _channelId: string): Promise<void> => {
            if (!messageId) return Promise.resolve();
            return chatRepository.cacheDelete(messageId);
        },
        [chatRepository]
    );

    return { isPending: { send: isSending }, sendMessage, readMessage, deleteMessage };
};
