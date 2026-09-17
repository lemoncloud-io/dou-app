import { useCallback, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
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

const EMPTY_IDS: ReadonlySet<string> = new Set();

const withoutId = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(ids);
    next.delete(id);
    return next;
};

/**
 * Chat writes for the room: send (optimistic insert + socket dispatch via the engine), advance the
 * read cursor, edit a message, and two different removals.
 *
 * The two removals are not variants of one thing. `deleteMessage` drops an unsent row from my own
 * cache — the ✕ beside a failed send, which the server never heard about. `deleteServerMessage`
 * asks the server to delete a message everyone can see. A previous comment here claimed there was
 * no server chat-delete API; there always was (`chat.delete`), and reading that comment as licence
 * to reach for the cache delete is exactly the mistake the two names are here to prevent.
 */
export const useChatMutations = () => {
    const { chat: chatRepository, join: joinRepository } = runtime.data.useRuntimeRepositories();
    const [isSending, setIsSending] = useState(false);
    // Keyed by message id rather than a single boolean: both operations name a message, and two
    // rows can be in flight at once (a slow delete while another message is being saved).
    const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
    const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);

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

    /** Removes an unsent (pending/failed) row from MY cache only. Not a server delete. */
    const deleteMessage = useCallback(
        (messageId: string, _channelId: string): Promise<void> => {
            if (!messageId) return Promise.resolve();
            return chatRepository.cacheDelete(messageId);
        },
        [chatRepository]
    );

    /**
     * Edits a message for everyone. Optimistic in the engine — the new text is in the cache before
     * the request and rolled back if it fails — so callers must not write the cache themselves.
     */
    const editMessage = useCallback(
        (messageId: string, content: string): Promise<DomainChat> => {
            if (!messageId) return Promise.reject(new Error('messageId is required'));
            setEditingIds(prev => new Set(prev).add(messageId));
            return chatRepository
                .updateChat({ id: messageId, content })
                .finally(() => setEditingIds(prev => withoutId(prev, messageId)));
        },
        [chatRepository]
    );

    /**
     * Deletes a message for everyone (soft delete — the row survives as a tombstone).
     *
     * NOT optimistic: the repository waits for the server before hiding anything, so nothing on
     * screen changes until it lands. That is why `isPending.deleteServer` exists — without a
     * visible in-flight state the message just sits there and the obvious thing to do is press
     * delete again.
     */
    const deleteServerMessage = useCallback(
        (messageId: string): Promise<DomainChat> => {
            if (!messageId) return Promise.reject(new Error('messageId is required'));
            setDeletingIds(prev => new Set(prev).add(messageId));
            return chatRepository
                .deleteChat({ id: messageId })
                .finally(() => setDeletingIds(prev => withoutId(prev, messageId)));
        },
        [chatRepository]
    );

    return {
        isPending: { send: isSending, edit: editingIds, deleteServer: deletingIds },
        sendMessage,
        readMessage,
        deleteMessage,
        editMessage,
        deleteServerMessage,
    };
};
