import { useCallback, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainChat, DomainJoin } from '@chatic/data';

import { beginChatSendTrace } from '../../../runtime/perf';

interface SendMessageInput {
    channelId: string;
    content: string;
    /**
     * Thread-reply target: the root's FULL id `<channelId>:<chatNo>` — the server
     * resolves it and 404s on a bare chatNo (ADR-0008/0045). Omit for a top-level send.
     */
    parentId?: string;
    /** Only a resend sets this: it carries the failed row's own content type across. */
    contentType?: DomainChat['contentType'];
}

interface ReadMessageInput {
    channelId: string;
    chatNo: number;
}

/**
 * The send payload that recreates a failed row. Everything the user sent is carried across — a reply
 * that came back as a top-level message, or a card that came back as plain text, is a different
 * message from the one they pressed send on.
 *
 * Rows stranded by the old chatNo-send bug hold a bare chatNo in `parentId`, and the server 404s it,
 * so those are rebuilt into the full `<channelId>:<chatNo>` id.
 */
export const toResendPayload = (row: DomainChat): SendMessageInput => {
    const parentId = row.parentId && !row.parentId.includes(':') ? `${row.channelId}:${row.parentId}` : row.parentId;
    return {
        channelId: row.channelId,
        content: row.content ?? '',
        ...(row.contentType ? { contentType: row.contentType } : {}),
        ...(parentId ? { parentId } : {}),
    };
};

const EMPTY_IDS: ReadonlySet<string> = new Set();

const withoutId = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(ids);
    next.delete(id);
    return next;
};

/**
 * Chat writes for the room: send (optimistic insert + socket dispatch via the engine), resend a
 * failed row, advance the read cursor, edit a message, and two different removals.
 *
 * A send and the unsent-row removal name their cloud, and nothing else here does. A send spans an
 * optimistic cache write and a socket request, and the app graph resolves each of those from the
 * selection at the moment it happens — so a cloud switch landing in between put the row in one cloud
 * and the message on another's socket. The caller passes the cloud it read when the user pressed
 * send, and the whole write is that cloud's. A failed row lives in the partition of the cloud it was
 * sent to, so removing it has to name that cloud too.
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

    /** Sends to `cid` — the cloud the user was in when they pressed send, captured by the caller then. */
    const sendMessage = useCallback((cid: string, payload: SendMessageInput): Promise<DomainChat> => {
        if (!payload.channelId || !payload.content) {
            return Promise.reject(new Error('channelId and content are required'));
        }
        setIsSending(true);
        const trace = beginChatSendTrace({ reply: !!payload.parentId });
        return runtime.data
            .sendChatInCloud(cid, payload)
            .then(
                chat => {
                    trace.end('ok');
                    return chat;
                },
                error => {
                    trace.end('error');
                    throw error;
                }
            )
            .finally(() => setIsSending(false));
    }, []);

    const readMessage = useCallback(
        (payload: ReadMessageInput): Promise<DomainJoin> => joinRepository.readChat(payload),
        [joinRepository]
    );

    /** Removes an unsent (pending/failed) row from MY cache in `cid` only. Not a server delete. */
    const deleteMessage = useCallback((cid: string, messageId: string): Promise<void> => {
        if (!messageId) return Promise.resolve();
        return runtime.data.getCloudRepositories(cid).chat.cacheDelete(messageId);
    }, []);

    /**
     * Resends a failed row to the cloud it was first sent to (`row.cid`), not to whichever cloud is
     * selected now: the row sits in that cloud's partition and names that cloud's channel. The stale
     * row goes first so the retry does not leave two copies on screen.
     */
    const retryMessage = useCallback(
        (row: DomainChat): Promise<DomainChat> => {
            if (!row.id) return Promise.reject(new Error('message id is required'));
            const payload = toResendPayload(row);
            // Checked before the delete: a row the send would refuse must not be removed first, or the
            // message is gone and nothing replaces it.
            if (!payload.channelId || !payload.content) {
                return Promise.reject(new Error('channelId and content are required'));
            }
            return deleteMessage(row.cid, row.id).then(() => sendMessage(row.cid, payload));
        },
        [deleteMessage, sendMessage]
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
        retryMessage,
        readMessage,
        deleteMessage,
        editMessage,
        deleteServerMessage,
    };
};
