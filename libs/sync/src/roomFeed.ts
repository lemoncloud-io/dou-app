import type { ChatRefreshResult } from '@chatic/data';
import type { PerfTrace } from '@chatic/perf';
import { endPerfTrace, getActivePerfTrace } from '@chatic/perf';

import { syncDataGraph } from './dataGraph';
import { getSocketManager, slotKeyOf } from '@chatic/transport';
import { getSyncManager } from './runtime';

const REUSE_MS = 2_000;

type RoomCache = 'hit' | 'miss';

interface RoomFeedEntry {
    promise: Promise<ChatRefreshResult>;
    settledAt?: number;
    onReceived?: Array<() => void>;
}

interface FetchRoomFeedOptions {
    cache?: RoomCache;
    fresh?: boolean;
}

const feeds = new Map<string, RoomFeedEntry>();

const keyOf = (cid: string, channelId: string): string => `${cid}:${channelId}`;

const reusable = (entry: RoomFeedEntry | undefined): entry is RoomFeedEntry =>
    !!entry && (entry.settledAt === undefined || Date.now() - entry.settledAt < REUSE_MS);

const untakenTrace = (channelId: string): PerfTrace | undefined => {
    const active = getActivePerfTrace('chat_room_sync', channelId);
    return active && !active.hasMetric('feed_sent') ? active : undefined;
};

const beginTrace = (
    trace: PerfTrace,
    entry: Pick<RoomFeedEntry, 'onReceived'>,
    cache: RoomCache | Promise<RoomCache | undefined> | undefined
): void => {
    if (typeof cache === 'string') trace.putAttribute('cache', cache);
    else void cache?.then(value => value && trace.putAttribute('cache', value));
    trace.mark('feed_sent');
    entry.onReceived?.push(() => trace.mark('feed_received'));
};

const finishTrace = (trace: PerfTrace, promise: Promise<ChatRefreshResult>): void => {
    promise.then(
        result => {
            trace.putMetric('fetched', result.fetchedCount);
            trace.putMetric('latest_no', result.latestNo);
            trace.mark('feed_done');
            if (result.fetchedCount === 0) endPerfTrace('chat_room_sync', trace, 'synced');
        },
        () => endPerfTrace('chat_room_sync', trace, 'error')
    );
};

const startOrJoin = (
    cid: string,
    channelId: string,
    cache: RoomCache | Promise<RoomCache | undefined> | undefined,
    fresh: boolean
): Promise<ChatRefreshResult> => {
    const key = keyOf(cid, channelId);
    const existing = feeds.get(key);
    const trace = untakenTrace(channelId);

    if (!fresh && reusable(existing)) {
        if (trace && existing.settledAt === undefined) {
            beginTrace(trace, existing, cache);
            finishTrace(trace, existing.promise);
        }
        if (!trace || existing.settledAt === undefined) return existing.promise;
    }

    const onReceived: Array<() => void> = [];
    const entry = { onReceived } as RoomFeedEntry;
    if (trace) beginTrace(trace, entry, cache);
    entry.promise = syncDataGraph
        .get()
        .getScopedRepositories(cid)
        .chat.refreshList(
            { channelId },
            {
                onFetched: () => {
                    entry.onReceived = undefined;
                    onReceived.forEach(run => run());
                },
            }
        )
        .then(
            result => {
                entry.settledAt = Date.now();
                return result;
            },
            error => {
                if (feeds.get(key) === entry) feeds.delete(key);
                throw error;
            }
        );
    if (trace) finishTrace(trace, entry.promise);
    feeds.set(key, entry);
    return entry.promise;
};

export const fetchRoomFeed = (
    cid: string,
    channelId: string,
    { cache, fresh = false }: FetchRoomFeedOptions = {}
): Promise<ChatRefreshResult> => startOrJoin(cid, channelId, cache, fresh);

export const prefetchRoomFeed = async (cid: string, channelId: string): Promise<ChatRefreshResult | null> => {
    if (!getSocketManager().isSlotVerified(slotKeyOf(cid))) return null;
    getSyncManager().registerChat(channelId, undefined, { cid })();
    const cache = syncDataGraph
        .get()
        .getScopedRepositories(cid)
        .chat.cacheReadList({ channelId })
        .then(
            (cached): RoomCache => ((cached?.list ?? []).some(chat => chat.chatNo > 0) ? 'hit' : 'miss'),
            () => undefined
        );
    try {
        return await startOrJoin(cid, channelId, cache, false);
    } catch {
        return null;
    }
};

export const resetRoomFeeds = (): void => {
    feeds.clear();
};
