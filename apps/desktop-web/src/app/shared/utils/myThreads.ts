import { ACCOUNT_CHANNEL_SID, type DomainChannel } from '@chatic/runtime-react';

import { bareChannelName, channelKind, type ChannelKind } from './channelLabel';

export const MY_THREADS_MAX = 100;

export interface MyThread {
    cid: string;
    channelId: string;
    placeId?: string;
    rootNo: string;
    rootPreview: string;
    rootOwnerName?: string;
    channelKind?: ChannelKind;
    channelName?: string;
    lastReplyNo: number;
    lastReplyPreview: string;
    lastReplyOwnerName: string;
    lastActivityAt: number;
    seenReplyNo: number;
}

export type MyThreads = Record<string, MyThread>;

export interface ThreadReply {
    cid: string;
    channelId: string;
    placeId?: string;
    channelKind?: ChannelKind;
    channelName?: string;
    rootNo: string;
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

export const threadChannel = (channel: DomainChannel): Pick<ThreadReply, 'channelKind' | 'channelName'> => {
    const kind = channelKind(channel);
    return { channelKind: kind, ...(kind === 'channel' ? { channelName: bareChannelName(channel.name) } : {}) };
};

export const myThreadKey = (cid: string, channelId: string, rootNo: string): string => `${cid}:${channelId}:${rootNo}`;

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

export const recordThreadReply = (
    threads: MyThreads,
    reply: ThreadReply,
    options: { root?: ThreadRoot; seen?: boolean } = {}
): MyThreads => {
    const key = myThreadKey(reply.cid, reply.channelId, reply.rootNo);
    const held = threads[key];
    if (!held && !options.root) return threads;
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
        rootOwnerName: base.rootOwnerName || options.root?.ownerName,
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
    return next[key] ? next : threads;
};

export const markThreadSeen = (threads: MyThreads, key: string): MyThreads => {
    const thread = threads[key];
    if (!thread || !isThreadUnread(thread)) return threads;
    return { ...threads, [key]: { ...thread, seenReplyNo: thread.lastReplyNo } };
};

export const isThreadInScope = (thread: MyThread, cid: string, placeScope: ReadonlySet<string>): boolean =>
    thread.cid === cid && (!thread.placeId || placeScope.has(thread.placeId));

export const threadsInScope = (
    threads: MyThreads,
    cid: string,
    placeScope: ReadonlySet<string>
): Array<[key: string, thread: MyThread]> =>
    Object.entries(threads)
        .filter(([, thread]) => isThreadInScope(thread, cid, placeScope))
        .sort(
            ([, a], [, b]) =>
                Number(isThreadUnread(b)) - Number(isThreadUnread(a)) || b.lastActivityAt - a.lastActivityAt
        );
