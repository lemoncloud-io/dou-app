import { isEventChat, type DomainChat } from '@chatic/runtime';

import { compareByChatNo } from '../../../shared/utils/chatSort';

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
    repliers: ThreadReplier[];
    newCount: number;
}

export interface NewReplyRule {
    readNo: number;
    seenByRoot?: ReadonlyMap<string, number>;
    isMine: (chat: DomainChat) => boolean;
}

const isNewReply = (reply: DomainChat, rootKey: string, rule: NewReplyRule | undefined): boolean => {
    if (!rule || rule.readNo <= 0 || reply.chatNo == null) return false;
    if (reply.hidden || rule.isMine(reply)) return false;
    return reply.chatNo > Math.max(rule.readNo, rule.seenByRoot?.get(rootKey) ?? 0);
};

export const buildThreadIndex = (messages: DomainChat[], newReplies?: NewReplyRule): Map<string, ThreadMeta> => {
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
        const prev = index.get(key) ?? { count: 0, lastReplyAt: 0, repliers: [], newCount: 0 };
        if (prev.count === 0) index.set(key, prev);
        prev.count += 1;
        if (at > prev.lastReplyAt) prev.lastReplyAt = at;
        if (isNewReply(message, key, newReplies)) prev.newCount += 1;
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
    const replies = messages.filter(m => m !== root && !!m.parentId && rootKeys.has(m.parentId));
    return { root, replies: replies.sort(compareByChatNo) };
};
