import type { DomainChat } from '@chatic/data';

/**
 * Thread derivation — pure, client-side (see ADR 0008). The backend models a
 * thread with nothing but `parentId`; everything below is computed from the
 * messages already in the local cache, so counts/contents are best-effort
 * (bounded by what's loaded) and must never be presented as authoritative.
 */

/**
 * The thread-root key of a message. The backend stores a reply's `parentId` as
 * the parent's channel-local sequence (`chatNo`), not its full id — so the key a
 * reply points at, and the key we filter/send by, is the root's `chatNo` (as a
 * string). A root has no `parentId`, so its key is its own `chatNo`. Threads are
 * flat (root-only): replying to a reply normalises to the same root via its
 * `parentId`.
 */
export const threadRootId = (chat: DomainChat): string =>
    chat.parentId ?? (chat.chatNo != null ? String(chat.chatNo) : (chat.id ?? ''));

const replyTime = (chat: DomainChat): number => chat.createdAt ?? chat.createdAtMs ?? 0;

const byChatNo = (a: DomainChat, b: DomainChat): number => {
    const an = a.chatNo ?? Number.MAX_SAFE_INTEGER;
    const bn = b.chatNo ?? Number.MAX_SAFE_INTEGER;
    if (an !== bn) return an - bn;
    return (a.createdAt ?? 0) - (b.createdAt ?? 0);
};

export interface ThreadMeta {
    /** Replies currently loaded under this root. Can under-count old threads. */
    count: number;
    /** `createdAt` of the newest loaded reply. */
    lastReplyAt: number;
}

/**
 * Aggregate, per thread root, the replies present in the loaded message set.
 * Keyed by root id; only roots with ≥1 loaded reply appear.
 */
export const buildThreadIndex = (messages: DomainChat[]): Map<string, ThreadMeta> => {
    const index = new Map<string, ThreadMeta>();
    for (const message of messages) {
        const parentId = message.parentId;
        if (!parentId) continue;
        const at = replyTime(message);
        const prev = index.get(parentId);
        if (prev) {
            prev.count += 1;
            if (at > prev.lastReplyAt) prev.lastReplyAt = at;
        } else {
            index.set(parentId, { count: 1, lastReplyAt: at });
        }
    }
    return index;
};

export interface ThreadView {
    /** The root message, if still in the loaded set (may be paged out — ADR 0008). */
    root: DomainChat | undefined;
    /** Direct replies to the root, oldest→newest. */
    replies: DomainChat[];
}

/**
 * Derive a single thread (root + its direct replies) from the loaded messages.
 * `rootId` is the root's `chatNo` as a string (see threadRootId) — that is what
 * a reply's `parentId` holds.
 */
export const buildThread = (messages: DomainChat[], rootId: string): ThreadView => {
    let root: DomainChat | undefined;
    const replies: DomainChat[] = [];
    for (const message of messages) {
        if (message.chatNo != null && String(message.chatNo) === rootId) root = message;
        else if (message.parentId === rootId) replies.push(message);
    }
    return { root, replies: replies.sort(byChatNo) };
};
