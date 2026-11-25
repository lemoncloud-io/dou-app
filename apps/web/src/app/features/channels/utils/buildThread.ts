import { isEventChat, type DomainChat } from '@chatic/runtime-react';

import { compareByChatNo } from '../../../utils';

export const threadRootId = (chat: DomainChat): string =>
    chat.parentId ?? (chat.chatNo != null ? String(chat.chatNo) : (chat.id ?? ''));

const replyTime = (chat: DomainChat): number => chat.createdAt ?? chat.createdAtMs ?? 0;

export interface ThreadReplier {
    id: string;
    thumbnail?: string;
}

export interface ThreadMeta {
    count: number;
    lastReplyAt: number;
    lastReplyNo: number;
    lastReplyOwnerId?: string;
    repliers: ThreadReplier[];
    entries: ThreadEntry[];
    lastReply?: DomainChat;
}

export interface ThreadEntry {
    chatNo: number;
    ownerId?: string;
    mention$?: DomainChat['mention$'];
}

export const unseenReplies = (meta: ThreadMeta, baselineReadNo: number, userId: string | null): ThreadEntry[] =>
    meta.entries.filter(entry => entry.chatNo > baselineReadNo && entry.ownerId !== userId);

export const countUnseenReplies = (meta: ThreadMeta, baselineReadNo: number, userId: string | null): number =>
    unseenReplies(meta, baselineReadNo, userId).length;

export const buildThreadIndex = (messages: DomainChat[]): Map<string, ThreadMeta> => {
    const idToChatNo = new Map<string, string>();
    for (const m of messages) {
        if (!m.parentId && m.id && m.chatNo != null) idToChatNo.set(m.id, String(m.chatNo));
    }
    const index = new Map<string, ThreadMeta>();
    for (const message of messages) {
        const parentId = message.parentId;
        if (!parentId) continue;
        if (isEventChat(message)) continue;
        const key = idToChatNo.get(parentId) ?? parentId;
        const at = replyTime(message);
        const prev = index.get(key) ?? { count: 0, lastReplyAt: 0, lastReplyNo: 0, repliers: [], entries: [] };
        if (prev.count === 0) index.set(key, prev);
        prev.count += 1;
        prev.entries.push({ chatNo: message.chatNo ?? 0, ownerId: message.ownerId, mention$: message.mention$ });
        if (at > prev.lastReplyAt) prev.lastReplyAt = at;
        if ((message.chatNo ?? 0) > prev.lastReplyNo) {
            prev.lastReplyNo = message.chatNo ?? 0;
            prev.lastReplyOwnerId = message.ownerId;
            prev.lastReply = message;
        }
        if (message.ownerId) {
            const seen = prev.repliers.find(r => r.id === message.ownerId);
            const thumbnail = message.owner$?.thumbnail;
            if (!seen) prev.repliers.push({ id: message.ownerId, thumbnail });
            else if (!seen.thumbnail && thumbnail) seen.thumbnail = thumbnail;
        }
    }
    return index;
};

export interface ThreadView {
    root: DomainChat | undefined;
    replies: DomainChat[];
}

export const buildThread = (messages: DomainChat[], rootId: string): ThreadView => {
    const root = messages.find(m => (m.chatNo != null && String(m.chatNo) === rootId) || (!!m.id && m.id === rootId));
    const rootKeys = new Set<string>([rootId]);
    if (root?.id) rootKeys.add(root.id);
    if (root?.chatNo != null) rootKeys.add(String(root.chatNo));
    const replies = messages.filter(m => m !== root && !!m.parentId && rootKeys.has(m.parentId) && !isEventChat(m));
    return { root, replies: replies.sort(compareByChatNo) };
};
