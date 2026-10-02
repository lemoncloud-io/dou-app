import type { ChatRefreshResult } from '@chatic/data';
import type { PerfTrace } from '@chatic/perf';
import { endPerfTrace, getActivePerfTrace } from '@chatic/perf';

import { getDataManager } from '../../data/runtime';
import { getSocketManager } from '../runtime';
import { slotKeyOf } from '../utils/slotKey';
import { getSyncManager } from './runtime';

/**
 * How long a finished fetch still answers for its room. The room's sync hooks run after the page has
 * mounted and read the cache, so a fetch started at the tap can finish before they ask. Within this
 * window they take its result instead of sending the same request again.
 */
const REUSE_MS = 2_000;

type RoomCache = 'hit' | 'miss';

interface RoomFeedEntry {
    promise: Promise<ChatRefreshResult>;
    settledAt?: number;
    /** Run when the page arrives, before it is written. Undefined once it has arrived. */
    onReceived?: Array<() => void>;
}

interface FetchRoomFeedOptions {
    /** Whether the room's cache held it, for the trace this fetch takes. */
    cache?: RoomCache;
    /**
     * Sends a new request even when one is in flight or just finished. For a caller that has to know
     * the page is from now, such as the refresh after the app comes back: a request sent before the
     * app was suspended can answer with a page from before the messages it missed.
     */
    fresh?: boolean;
}

const feeds = new Map<string, RoomFeedEntry>();

const keyOf = (cid: string, channelId: string): string => `${cid}:${channelId}`;

const reusable = (entry: RoomFeedEntry | undefined): entry is RoomFeedEntry =>
    !!entry && (entry.settledAt === undefined || Date.now() - entry.settledAt < REUSE_MS);

/** The room's `chat_room_sync` trace, if no fetch has taken it yet. */
const untakenTrace = (channelId: string): PerfTrace | undefined => {
    const active = getActivePerfTrace('chat_room_sync', channelId);
    return active && !active.hasMetric('feed_sent') ? active : undefined;
};

/**
 * Takes `trace` for the fetch `entry` holds, up to the request: its `cache` attribute, `feed_sent`,
 * and `feed_received` once the page arrives. Called before the request goes out, so the arrival is
 * seen however soon it comes.
 */
const beginTrace = (
    trace: PerfTrace,
    entry: Pick<RoomFeedEntry, 'onReceived'>,
    cache: RoomCache | Promise<RoomCache | undefined> | undefined
): void => {
    if (typeof cache === 'string') trace.putAttribute('cache', cache);
    // A cache state still being read is recorded when it arrives. The fetch does not wait for it.
    else void cache?.then(value => value && trace.putAttribute('cache', value));
    trace.mark('feed_sent');
    // `feed_received` splits the wait into the server round trip and the cache write after it.
    entry.onReceived?.push(() => trace.mark('feed_received'));
};

/**
 * The rest of a taken trace: the page's counts and `feed_done`, then the end when nothing was written
 * (no list re-emission will follow for the room to wait on) or when the fetch failed.
 */
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
        // A joined caller marks nothing: the trace already belongs to the fetch it joined. Except a
        // room entry no fetch has taken yet — a second tap on the same room while its first fetch is
        // still out. That entry waits on this fetch too, so it takes the trace for it.
        if (trace && existing.settledAt === undefined) {
            beginTrace(trace, existing, cache);
            finishTrace(trace, existing.promise);
        }
        // A trace no fetch took joins nothing that has already finished: that answer came before this
        // entry began, so it gets a request of its own below.
        if (!trace || existing.settledAt === undefined) return existing.promise;
    }

    const onReceived: Array<() => void> = [];
    const entry = { onReceived } as RoomFeedEntry;
    if (trace) beginTrace(trace, entry, cache);
    entry.promise = getDataManager()
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

/**
 * Fetches a room's latest page into the cache, once per room however many callers ask at the same
 * time.
 *
 * A room entry has up to three callers for the same page: the tap (`prefetchRoomFeed`), then
 * whichever of the cold prime and the warm entry refresh applies. A caller that finds a fetch in
 * flight, or one that finished within `REUSE_MS`, is handed that fetch's result. A failed fetch is
 * forgotten at once, so a retry sends a new request.
 *
 * The fetch that starts also takes the room's `chat_room_sync` trace if no fetch has yet. It marks the
 * phases and ends the trace when nothing was written, or when it failed.
 */
export const fetchRoomFeed = (
    cid: string,
    channelId: string,
    { cache, fresh = false }: FetchRoomFeedOptions = {}
): Promise<ChatRefreshResult> => startOrJoin(cid, channelId, cache, fresh);

/**
 * Starts a room's fetch at the tap that opens it, so the request is out while the page transition
 * runs and the room page mounts, instead of after both.
 *
 * Only when `cid`'s socket is already verified: before that the request would fail, and the room's
 * own sync hooks wait for verification anyway.
 *
 * The room's chat target is registered first. A `chat.sync` push reaches only registered targets, so
 * without it a message sent between this fetch's answer and the room page registering its own target
 * would be dropped. Disposing at once leaves the target in its unregister grace, where it stays live
 * until the room's registration joins it.
 *
 * The request goes out at once. Whether the room was cold or warm is read alongside it, because only
 * this caller knows yet and the trace records which. Awaiting that read first measurably held the
 * request back past the page transition. The read is issued before the fetch, so it is answered from
 * the cache as it was before this fetch writes to it.
 *
 * Never rejects. The room's hooks fetch on their own if this one did not start or failed.
 */
export const prefetchRoomFeed = async (cid: string, channelId: string): Promise<void> => {
    if (!getSocketManager().isSlotVerified(slotKeyOf(cid))) return;
    getSyncManager().registerChat(channelId, undefined, { cid })();
    // Never rejects: a failed read only leaves the trace without its `cache` attribute.
    const cache = getDataManager()
        .getScopedRepositories(cid)
        .chat.cacheReadList({ channelId })
        .then(
            (cached): RoomCache => ((cached?.list ?? []).some(chat => chat.chatNo > 0) ? 'hit' : 'miss'),
            () => undefined
        );
    try {
        await startOrJoin(cid, channelId, cache, false);
    } catch {
        // The room's hooks fetch again, and they log a failure that is still there.
    }
};

/** Forgets every remembered fetch. For tests. */
export const resetRoomFeeds = (): void => {
    feeds.clear();
};
