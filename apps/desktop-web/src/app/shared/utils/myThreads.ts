import { ACCOUNT_CHANNEL_SID, type DomainChannel } from '@chatic/data';

import { bareChannelName, channelKind, type ChannelKind } from './channelLabel';

/**
 * The rules of the device-local "my threads" list: the threads this device has seen the user take part
 * in, as a reply author or as the author of the root. The server keeps no such list and a root carries
 * no reply aggregate, so the list is built from what passes through this device and is only as complete
 * as that. Pure — the store and the capture hooks only feed these functions.
 */

/** Bound storage: keep only the most recently active threads. */
export const MY_THREADS_MAX = 100;

export interface MyThread {
    cid: string;
    channelId: string;
    /** The channel's `sid` — scopes a group channel's thread to its place, and is handed on when a row is opened. */
    placeId?: string;
    /** The root's chatNo, as a string — the same form a persisted reply's `parentId` carries. */
    rootNo: string;
    rootPreview: string;
    /** Who wrote the root. Absent on entries recorded before it was kept. */
    rootOwnerName?: string;
    /** The channel as it was when last recorded — decides the scope, and names a row whose channel is not loaded. */
    channelKind?: ChannelKind;
    /** A named channel's name, without `#`. A DM's name is its person, resolved live, so none is kept. */
    channelName?: string;
    /** Newest server-numbered reply seen; 0 while only an unsent reply of mine has been. */
    lastReplyNo: number;
    lastReplyPreview: string;
    lastReplyOwnerName: string;
    /** Epoch ms of the newest reply seen — the list's order. */
    lastActivityAt: number;
    /** Reply number up to which the thread has been looked at. Above it reads as a new reply. */
    seenReplyNo: number;
}

export type MyThreads = Record<string, MyThread>;

/** One reply as a capture point sees it. */
export interface ThreadReply {
    cid: string;
    channelId: string;
    placeId?: string;
    channelKind?: ChannelKind;
    channelName?: string;
    rootNo: string;
    /** Server chatNo; 0 for my own reply before the server has numbered it. */
    replyNo: number;
    preview: string;
    ownerName: string;
    at: number;
    mine: boolean;
}

export interface ThreadRoot {
    preview: string;
    ownerName: string;
}

/** The channel fields a reply carries, read from the channel it landed in. */
export const threadChannel = (channel: DomainChannel): Pick<ThreadReply, 'channelKind' | 'channelName'> => {
    const kind = channelKind(channel);
    return { channelKind: kind, ...(kind === 'channel' ? { channelName: bareChannelName(channel.name) } : {}) };
};

export const myThreadKey = (cid: string, channelId: string, rootNo: string): string => `${cid}:${channelId}:${rootNo}`;

/**
 * A reply's `parentId` as the root's chatNo. A persisted reply carries the chatNo string; an
 * optimistic one — and the send body — carries the root's full `<channelId>:<chatNo>` id.
 */
export const threadRootNo = (parentId: string): string => parentId.slice(parentId.lastIndexOf(':') + 1);

export const isThreadUnread = (thread: MyThread): boolean => thread.lastReplyNo > thread.seenReplyNo;

const evict = (threads: MyThreads): MyThreads => {
    const keys = Object.keys(threads);
    if (keys.length <= MY_THREADS_MAX) return threads;
    const oldestFirst = keys.sort((a, b) => threads[a].lastActivityAt - threads[b].lastActivityAt);
    const next = { ...threads };
    for (const key of oldestFirst.slice(0, keys.length - MY_THREADS_MAX)) delete next[key];
    return next;
};

/**
 * Applies a reply. A thread the list does not hold yet is started only when the caller passes its
 * `root` — the caller has decided the user takes part in it (the reply is theirs, or the root is). A
 * reply already applied returns `threads` itself, so a store built on this writes nothing.
 * `seen` records the thread as looked at — for history read from the cache, which is not news.
 */
export const recordThreadReply = (
    threads: MyThreads,
    reply: ThreadReply,
    options: { root?: ThreadRoot; seen?: boolean } = {}
): MyThreads => {
    const key = myThreadKey(reply.cid, reply.channelId, reply.rootNo);
    const held = threads[key];
    if (!held && !options.root) return threads;
    // A numbered reply at or below the newest one seen has been applied already. An unnumbered one is
    // my reply on its way out, newer than anything here.
    if (held && reply.replyNo > 0 && reply.replyNo <= held.lastReplyNo) return threads;

    const lastReplyNo = Math.max(held?.lastReplyNo ?? 0, reply.replyNo);
    const base = held ?? {
        cid: reply.cid,
        channelId: reply.channelId,
        rootNo: reply.rootNo,
        rootPreview: options.root?.preview ?? '',
        seenReplyNo: 0,
    };
    const thread: MyThread = {
        ...base,
        // An entry with no author yet — kept before authors were, or read without one — learns it from
        // the next root read that has it.
        rootOwnerName: base.rootOwnerName || options.root?.ownerName,
        // The Self Channel's stand-in sid names no place: nowhere to switch to.
        placeId: reply.placeId === ACCOUNT_CHANNEL_SID ? undefined : (reply.placeId ?? held?.placeId),
        channelKind: reply.channelKind ?? held?.channelKind,
        channelName: reply.channelName ?? held?.channelName,
        lastReplyNo,
        lastReplyPreview: reply.preview,
        lastReplyOwnerName: reply.ownerName,
        lastActivityAt: Math.max(held?.lastActivityAt ?? 0, reply.at),
        seenReplyNo: reply.mine || options.seen ? lastReplyNo : base.seenReplyNo,
    };
    const next = evict({ ...threads, [key]: thread });
    // A newcomer older than every kept thread is evicted at once — hand back `threads` so nothing writes.
    return next[key] ? next : threads;
};

/** Marks a thread looked at up to its newest reply. Returns `threads` itself when nothing changes. */
export const markThreadSeen = (threads: MyThreads, key: string): MyThreads => {
    const thread = threads[key];
    if (!thread || !isThreadUnread(thread)) return threads;
    return { ...threads, [key]: { ...thread, seenReplyNo: thread.lastReplyNo } };
};

/**
 * Whether a thread belongs to a cloud and, when a place is given, to that place. Only a group channel
 * lives in a place. A 1:1 and the Self Channel belong to the cloud — their `sid` is where someone was
 * standing, not a scope key — so their threads are in every place of it, the relay's 1:1s included.
 */
export const isThreadIn = (thread: MyThread, cid: string, placeId?: string): boolean => {
    if (thread.cid !== cid) return false;
    if (!placeId || !thread.placeId) return true;
    return thread.channelKind === 'dm' || thread.channelKind === 'self' || thread.placeId === placeId;
};

/** Marks every thread of a cloud — of one place, when given — looked at. Returns `threads` itself when none was unread. */
export const markCloudSeen = (threads: MyThreads, cid: string, placeId?: string): MyThreads => {
    let next: MyThreads | null = null;
    for (const [key, thread] of Object.entries(threads)) {
        if (!isThreadIn(thread, cid, placeId) || !isThreadUnread(thread)) continue;
        next ??= { ...threads };
        next[key] = { ...thread, seenReplyNo: thread.lastReplyNo };
    }
    return next ?? threads;
};

/** One cloud's threads — one place's, when given — most recently active first. */
export const threadsForCloud = (threads: MyThreads, cid: string, placeId?: string): MyThread[] =>
    Object.values(threads)
        .filter(thread => isThreadIn(thread, cid, placeId))
        .sort((a, b) => b.lastActivityAt - a.lastActivityAt);
