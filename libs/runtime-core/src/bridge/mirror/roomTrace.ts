import type { ChatRefreshResult } from '@chatic/data';
import { SESSION_OWNER_ATTRIBUTE, endPerfTrace, getActivePerfTrace } from '@chatic/perf';
import type { PerfTrace } from '@chatic/perf';

const activeTrace = (channelId: string): PerfTrace | undefined => {
    const trace = getActivePerfTrace('chat_room_sync', channelId);
    trace?.putAttribute(SESSION_OWNER_ATTRIBUTE, 'native');
    return trace;
};

export const markPrimeAsked = (channelId: string): void => activeTrace(channelId)?.mark('verified');

export const traceRoomFetch = (channelId: string, result: Promise<ChatRefreshResult | null | undefined>): void => {
    const trace = activeTrace(channelId);
    if (!trace || trace.hasMetric('feed_sent')) return;
    trace.mark('feed_sent');
    result.then(
        settled => {
            if (!settled) {
                endPerfTrace('chat_room_sync', trace, 'error');
                return;
            }
            trace.putMetric('fetched', settled.fetchedCount);
            trace.putMetric('latest_no', settled.latestNo);
            trace.mark('feed_done');
            if (settled.fetchedCount === 0) endPerfTrace('chat_room_sync', trace, 'synced');
        },
        () => endPerfTrace('chat_room_sync', trace, 'error')
    );
};
