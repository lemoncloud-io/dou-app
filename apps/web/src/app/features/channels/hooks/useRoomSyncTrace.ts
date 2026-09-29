import { useEffect, useRef } from 'react';

import { clearActivePerfTrace } from '@chatic/perf';

import { roomOpenTrace } from '../../../runtime/perf';

import type { DomainChat } from '@chatic/data';
import type { PerfTrace } from '@chatic/perf';

/** Past this with no synced page on screen, the trace is closed as timed out. */
export const ROOM_SYNC_TIMEOUT_MS = 30_000;

/**
 * How long an unmounted room's sync trace waits for a remount of the same room before it is
 * closed as `left` — React's development double-mount, or a route re-rendering its element.
 */
export const ROOM_SYNC_LEAVE_GRACE_MS = 1_000;

type RoomSyncOutcome = 'synced' | 'timeout' | 'background' | 'left';

const end = (trace: PerfTrace, outcome: RoomSyncOutcome): void => {
    clearActivePerfTrace('chat_room_sync', trace);
    trace.putAttribute('outcome', outcome);
    trace.stop();
};

/**
 * Traces whose room unmounted and that are waiting out the grace window, by channel, so a remount
 * of the same room can carry on with one.
 */
const parked = new Map<string, { trace: PerfTrace; timer: ReturnType<typeof setTimeout> }>();

const closeParked = (channelId: string): void => {
    const entry = parked.get(channelId);
    if (!entry) return;
    clearTimeout(entry.timer);
    parked.delete(channelId);
    // The sync hook may have ended it in the meantime (an error, an empty page); `end` on a
    // stopped trace changes nothing.
    end(entry.trace, 'left');
};

// Timers stop in the background, so a grace window left running across it would come back with
// the time away in the duration. The user had already left those rooms; close them as such now.
if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return;
        for (const channelId of [...parked.keys()]) closeParked(channelId);
    });
}

/** Drops every parked trace without recording it. Tests only — the map is module state. */
export const resetParkedRoomSyncTraces = (): void => {
    for (const { timer } of parked.values()) clearTimeout(timer);
    parked.clear();
};

const maxChatNo = (chats: DomainChat[]): number => chats.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);

export interface UseRoomSyncTraceParams {
    channelId: string | undefined;
    /** The room's unfiltered chat window; a new array on every list emission. */
    rawChats: DomainChat[];
}

/**
 * Ends the `chat_room_sync` trace that the tap into this room began: tap to the room showing its
 * synced, latest messages, rather than whatever the cache held when it first drew.
 *
 * The phases in between are marked by the sync itself, which runs outside this page:
 *
 * - `verified`  — the sync saw the room's socket slot verified (at once, when it already was)
 * - `feed_sent` / `feed_done` — the latest page was requested and written to the cache, with
 *                 `fetched` rows and `latest_no` its newest row; `cache` says whether the room was
 *                 cold (`miss`, the sync hook's first page) or warm (`hit`, the foreground refresh)
 *
 * This page adds `mount`, and ends the trace once the list it renders holds the fetched page's
 * newest row — the cache write re-emits the list, and that is the page reaching the screen. The row
 * is checked, not merely a new list: the window can change for other reasons in between (a join
 * cursor arriving), and ending on that would record the room before it caught up. A sync that
 * wrote nothing is ended by the sync hook itself, since no emission would follow.
 *
 * The trace is taken only from the claim of this room's `chat_room_open` in the same mount, so a
 * sync trace begun for some other visit is never adopted here.
 *
 * `outcome` is `synced`, `error` (the fetch failed; set by the sync hook), `timeout`, `background`
 * (the app left the foreground; timers stop there, so the duration would include the time away) or
 * `left` (the user left first).
 */
export const useRoomSyncTrace = ({ channelId, rawChats }: UseRoomSyncTraceParams) => {
    const traceRef = useRef<PerfTrace | null>(null);

    useEffect(() => {
        if (!channelId) return;
        // A fresh tap into this room wins over a trace still parked from leaving it, which the user
        // did leave. Without one, a remount inside the grace window carries on the parked trace.
        const claimed = roomOpenTrace.takeClaimedSync(channelId);
        let trace = claimed;
        if (claimed) {
            closeParked(channelId);
        } else {
            const resumed = parked.get(channelId);
            if (resumed) {
                clearTimeout(resumed.timer);
                parked.delete(channelId);
                trace = resumed.trace;
            }
        }
        if (!trace) return;

        trace.mark('mount');
        traceRef.current = trace;

        const finish = (outcome: RoomSyncOutcome) => {
            if (traceRef.current !== trace) return;
            traceRef.current = null;
            end(trace, outcome);
        };

        const timer = setTimeout(() => finish('timeout'), ROOM_SYNC_TIMEOUT_MS);
        const onVisibilityChange = () => {
            if (document.visibilityState === 'hidden') finish('background');
        };
        document.addEventListener('visibilitychange', onVisibilityChange);

        return () => {
            clearTimeout(timer);
            document.removeEventListener('visibilitychange', onVisibilityChange);
            if (traceRef.current !== trace) return;
            traceRef.current = null;
            closeParked(channelId);
            parked.set(channelId, {
                trace,
                timer: setTimeout(() => closeParked(channelId), ROOM_SYNC_LEAVE_GRACE_MS),
            });
        };
    }, [channelId]);

    useEffect(() => {
        const trace = traceRef.current;
        if (!trace || !trace.hasMetric('feed_done')) return;
        const latestNo = trace.getMetric('latest_no') ?? 0;
        if (latestNo > 0 && maxChatNo(rawChats) < latestNo) return;
        traceRef.current = null;
        trace.putMetric('message_count', rawChats.length);
        end(trace, 'synced');
    }, [rawChats]);
};
