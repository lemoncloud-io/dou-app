import { useCallback, useState } from 'react';

import { runtime, toMentionBody, type ChatMentionBody, type DomainChat } from '@chatic/runtime';

import { beginChatSendTrace } from '../../../runtime/perf';

interface SendMessageInput {
    channelId: string;
    content: string;
    parentId?: string;
    contentType?: DomainChat['contentType'];
    mention?: ChatMentionBody;
}

export const toResendPayload = (row: DomainChat): SendMessageInput => {
    const parentId = row.parentId && !row.parentId.includes(':') ? `${row.channelId}:${row.parentId}` : row.parentId;
    const mention = toMentionBody(row.mention$);
    return {
        channelId: row.channelId,
        content: row.content ?? '',
        ...(row.contentType ? { contentType: row.contentType } : {}),
        ...(parentId ? { parentId } : {}),
        ...(mention ? { mention } : {}),
    };
};

const EMPTY_IDS: ReadonlySet<string> = new Set();

const withoutId = (ids: ReadonlySet<string>, id: string): ReadonlySet<string> => {
    const next = new Set(ids);
    next.delete(id);
    return next;
};

export const useChatMutations = () => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [isSending, setIsSending] = useState(false);
    const [editingIds, setEditingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);
    const [deletingIds, setDeletingIds] = useState<ReadonlySet<string>>(EMPTY_IDS);

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

    const deleteMessage = useCallback((cid: string, messageId: string): Promise<void> => {
        if (!messageId) return Promise.resolve();
        return runtime.data.getCloudRepositories(cid).chat.cacheDelete(messageId);
    }, []);

    const retryMessage = useCallback(
        (row: DomainChat): Promise<DomainChat> => {
            if (!row.id) return Promise.reject(new Error('message id is required'));
            const payload = toResendPayload(row);
            if (!payload.channelId || !payload.content) {
                return Promise.reject(new Error('channelId and content are required'));
            }
            return deleteMessage(row.cid, row.id).then(() => sendMessage(row.cid, payload));
        },
        [deleteMessage, sendMessage]
    );

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
        deleteMessage,
        editMessage,
        deleteServerMessage,
    };
};
