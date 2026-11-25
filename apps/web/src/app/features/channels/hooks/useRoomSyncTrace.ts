import { useEffect, useRef } from 'react';

import { clearActivePerfTrace } from '@chatic/perf';

import { roomOpenTrace } from '../../../runtime/perf';

import type { DomainChat } from '@chatic/runtime-react';
import type { PerfTrace } from '@chatic/perf';

export const ROOM_SYNC_TIMEOUT_MS = 30_000;

export const ROOM_SYNC_LEAVE_GRACE_MS = 1_000;

type RoomSyncOutcome = 'synced' | 'timeout' | 'background' | 'left';

const end = (trace: PerfTrace, outcome: RoomSyncOutcome): void => {
    clearActivePerfTrace('chat_room_sync', trace);
    trace.putAttribute('outcome', outcome);
    trace.stop();
};

const parked = new Map<string, { trace: PerfTrace; timer: ReturnType<typeof setTimeout> }>();

const closeParked = (channelId: string): void => {
    const entry = parked.get(channelId);
    if (!entry) return;
    clearTimeout(entry.timer);
    parked.delete(channelId);
    end(entry.trace, 'left');
};

if (typeof document !== 'undefined') {
    document.addEventListener('visibilitychange', () => {
        if (document.visibilityState !== 'hidden') return;
        for (const channelId of [...parked.keys()]) closeParked(channelId);
    });
}

export const resetParkedRoomSyncTraces = (): void => {
    for (const { timer } of parked.values()) clearTimeout(timer);
    parked.clear();
};

const maxChatNo = (chats: DomainChat[]): number => chats.reduce((max, chat) => Math.max(max, chat.chatNo ?? 0), 0);

export interface UseRoomSyncTraceParams {
    channelId: string | undefined;
    rawChats: DomainChat[];
}

export const useRoomSyncTrace = ({ channelId, rawChats }: UseRoomSyncTraceParams) => {
    const traceRef = useRef<PerfTrace | null>(null);

    useEffect(() => {
        if (!channelId) return;
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
