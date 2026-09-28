import { useEffect, useRef } from 'react';

import { roomOpenTrace } from '../../../runtime/perf';

import type { PerfTrace } from '@chatic/perf';

/**
 * A room that has not shown a message by now is recorded as timed out rather than left open. Well
 * inside the native side's expiry for an unstopped trace, so the slowest opens still land.
 */
export const ROOM_OPEN_TIMEOUT_MS = 30_000;

export interface UseRoomOpenTraceParams {
    channelId: string | undefined;
    /** The page's own gate for the skeleton — channel and chats both. */
    isRoomLoading: boolean;
    /** Whether the chat list is still waiting on its first cache emission. */
    isChatLoading: boolean;
    messageCount: number;
    /**
     * Whether the loaded window holds the thread's first row (`chatNo` 1). With it and no visible
     * message, the room is proven empty rather than still loading.
     */
    atThreadStart: boolean;
}

type RoomOpenOutcome = 'shown' | 'empty' | 'timeout' | 'background';

/**
 * Ends the `chat_room_open` trace that the tap into this room began.
 *
 * Only a room something began a trace for records anything — a list tap, a push, a link. The page
 * claims the trace at mount and closes it on the first commit that shows messages, which is the
 * moment the reporter was waiting for. Phases marked on the way, in ms from the trace's start:
 *
 * - `mount`      — this page mounted: routing, any switch, and the route chunk are behind us
 * - `cache_emit` — the first chat-list emission from the local cache, with `cache` saying
 *                  whether it already had rows (`hit`) or the messages still had to be fetched
 *                  (`miss`)
 *
 * The end is measured against the skeleton's own gate, channel and chats together. Loading alone
 * is not the end: on a cold cache the first emission is empty and the page shows an empty room
 * before the fetched rows arrive, and that is still waiting from the user's side.
 *
 * `outcome` is one of:
 * - `shown`      — messages are on screen, the case the duration is read for
 * - `empty`      — loaded, holding the thread's first row, and nothing to show; a room with no
 *                  rows at all cannot be told from one still loading, and ends as `timeout`
 * - `timeout`    — nothing showed within `ROOM_OPEN_TIMEOUT_MS`
 * - `background` — the app left the foreground first; timers stop there, so the duration would
 *                  otherwise include however long the app sat in the background
 * - `left`       — the user left the room first (closed by the hand-off slot, see `release`)
 *
 * The slow outcomes are kept rather than discarded: a room slow enough to give up on is the sample
 * the investigation is for.
 */
export const useRoomOpenTrace = ({
    channelId,
    isRoomLoading,
    isChatLoading,
    messageCount,
    atThreadStart,
}: UseRoomOpenTraceParams) => {
    const traceRef = useRef<PerfTrace | null>(null);
    const cacheMarkedRef = useRef(false);

    useEffect(() => {
        if (!channelId) return;
        const trace = roomOpenTrace.claim(channelId);
        if (!trace) return;

        trace.mark('mount');
        traceRef.current = trace;
        cacheMarkedRef.current = false;

        const finish = (outcome: RoomOpenOutcome) => {
            if (traceRef.current !== trace) return;
            traceRef.current = null;
            trace.putAttribute('outcome', outcome);
            trace.stop();
        };

        const timer = setTimeout(() => finish('timeout'), ROOM_OPEN_TIMEOUT_MS);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') finish('background');
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            // Still open means the room unmounted before showing anything. Handed back rather than
            // closed here, so a remount of the same room picks it up again.
            if (traceRef.current === trace) {
                traceRef.current = null;
                roomOpenTrace.release(channelId, trace);
            }
        };
    }, [channelId]);

    useEffect(() => {
        const trace = traceRef.current;
        if (!trace || isChatLoading || cacheMarkedRef.current) return;
        cacheMarkedRef.current = true;
        trace.mark('cache_emit');
        trace.putAttribute('cache', messageCount > 0 ? 'hit' : 'miss');
    }, [isChatLoading, messageCount]);

    useEffect(() => {
        const trace = traceRef.current;
        if (!trace || isRoomLoading) return;
        if (messageCount === 0 && !atThreadStart) return;
        traceRef.current = null;
        trace.putMetric('message_count', messageCount);
        trace.putAttribute('outcome', messageCount > 0 ? 'shown' : 'empty');
        trace.stop();
    }, [isRoomLoading, messageCount, atThreadStart]);
};
