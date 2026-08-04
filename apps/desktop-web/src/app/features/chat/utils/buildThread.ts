import type { DomainChat } from '@chatic/data';

import { compareByChatNo } from '../../../shared/utils/chatSort';

/**
 * Thread derivation — pure, client-side (see ADR 0008). The backend models a
 * thread with nothing but `parentId`; everything below is computed from the
 * messages already in the local cache, so counts/contents are best-effort
 * (bounded by what's loaded) and must never be presented as authoritative.
 */

/**
 * The thread-root key of a message — the root's `chatNo` as a string.
 *
 * parentId encoding contract (server: socials-api getThreadRoot):
 * - SEND takes the parent's FULL id `<channelId>:<chatNo>` (the server resolves
 *   it and 404s on anything else — never send a bare chatNo).
 * - STORED/broadcast records carry `parentId` normalised to the root's `chatNo`
 *   string ("1"); the full id survives only in `parent$.id`.
 * - An OPTIMISTIC reply carries the payload verbatim, i.e. the full id, until
 *   the persisted swap replaces it.
 * So matching accepts BOTH encodings (see buildThread/buildThreadIndex), while
 * this key — used by the open-thread store and footer — stays the chatNo string.
 * Threads are flat (root-only): the server folds reply-to-reply onto the root.
 */
export const threadRootId = (chat: DomainChat): string =>
    chat.parentId ?? (chat.chatNo != null ? String(chat.chatNo) : (chat.id ?? ''));

const replyTime = (chat: DomainChat): number => chat.createdAt ?? chat.createdAtMs ?? 0;

export interface ThreadReplier {
    /** Reply author (`ownerId`); replies without one are counted but not listed. */
    id: string;
    /** `owner$` thumbnail when embedded on a loaded reply (persisted only). */
    thumbnail?: string;
}

export interface ThreadMeta {
    /** Replies currently loaded under this root. Can under-count old threads. */
    count: number;
    /** `createdAt` of the newest loaded reply. */
    lastReplyAt: number;
    /** Unique reply authors in first-seen order — feeds the footer avatar stack. */
    repliers: ThreadReplier[];
}

/**
 * Aggregate, per thread root, the replies present in the loaded message set.
 * Keyed by the root's chatNo string; only roots with ≥1 loaded reply appear.
 * A reply's parentId may be either encoding (persisted = chatNo, optimistic =
 * full id) — full ids are normalised to the root's chatNo so a mixed-encoding
 * thread collapses into ONE entry and the footer count stays exact through the
 * optimistic→persisted round-trip. A full-id entry whose root is paged out
 * can't normalise, but that root renders no row either, so it is inert.
 */
export const buildThreadIndex = (messages: DomainChat[]): Map<string, ThreadMeta> => {
    const idToChatNo = new Map<string, string>();
    for (const m of messages) {
        if (!m.parentId && m.id && m.chatNo != null) idToChatNo.set(m.id, String(m.chatNo));
    }
    const index = new Map<string, ThreadMeta>();
    for (const message of messages) {
        const parentId = message.parentId;
        if (!parentId) continue;
        // Deleted replies are counted because they are still shown — as a tombstone,
        // the same as anywhere else. The footer's job is to say how many rows are
        // behind it, so counting and showing have to agree; skipping them here would
        // put a "2 replies" footer above a thread containing three.
        if (message.subType === 'reaction') continue;
        const key = idToChatNo.get(parentId) ?? parentId;
        const at = replyTime(message);
        const prev = index.get(key) ?? { count: 0, lastReplyAt: 0, repliers: [] };
        if (prev.count === 0) index.set(key, prev);
        prev.count += 1;
        if (at > prev.lastReplyAt) prev.lastReplyAt = at;
        if (message.ownerId) {
            const seen = prev.repliers.find(r => r.id === message.ownerId);
            const thumbnail = message.owner$?.thumbnail;
            if (!seen) prev.repliers.push({ id: message.ownerId, thumbnail });
            // Optimistic replies carry no owner$ — backfill once the persisted copy lands.
            else if (!seen.thumbnail && thumbnail) seen.thumbnail = thumbnail;
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
 * `rootId` is the root's `chatNo` string (see threadRootId), but both it and a
 * full id resolve; replies match by EITHER encoding (persisted parentId =
 * chatNo, optimistic = full id). When the root is paged out (ADR 0008), the
 * key set degrades to `rootId` alone — chatNo-encoded replies still match.
 */
export const buildThread = (messages: DomainChat[], rootId: string): ThreadView => {
    const root = messages.find(m => (m.chatNo != null && String(m.chatNo) === rootId) || (!!m.id && m.id === rootId));
    const rootKeys = new Set<string>([rootId]);
    if (root?.id) rootKeys.add(root.id);
    if (root?.chatNo != null) rootKeys.add(String(root.chatNo));
    const replies = messages.filter(m => m !== root && !!m.parentId && rootKeys.has(m.parentId));
    return { root, replies: replies.sort(compareByChatNo) };
};
