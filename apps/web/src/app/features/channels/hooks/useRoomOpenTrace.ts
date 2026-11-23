import { useEffect, useRef } from 'react';

import { roomOpenTrace } from '../../../runtime/perf';

import type { PerfTrace } from '@chatic/perf';

export const ROOM_OPEN_TIMEOUT_MS = 30_000;

export interface UseRoomOpenTraceParams {
    channelId: string | undefined;
    isRoomLoading: boolean;
    isChatLoading: boolean;
    messageCount: number;
    atThreadStart: boolean;
}

type RoomOpenOutcome = 'shown' | 'empty' | 'timeout' | 'background';

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
