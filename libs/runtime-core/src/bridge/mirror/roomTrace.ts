import type { ChatRefreshResult } from '@chatic/data';
import { SESSION_OWNER_ATTRIBUTE, endPerfTrace, getActivePerfTrace } from '@chatic/perf';
import type { PerfTrace } from '@chatic/perf';

/**
 * A room being opened has a `chat_room_sync` trace in progress, in the page. Where the runtime runs in
 * the page, the room's prime and its first-page fetch mark it themselves; across the bridge they run in
 * the shell, which has no such trace, so the mirror marks it around the calls instead:
 *
 * - the prime marks `verified` as it is asked, as the in-process prime does on entry;
 * - the first fetch for the room takes the trace: `feed_sent` as it is asked, then on its result the
 *   page's counts and `feed_done`, ending the trace when nothing was written (no list re-emission follows
 *   for the room to wait on) or when the fetch failed.
 *
 * What only the shell sees is left out: `feed_received` (the server's answer arriving, before the cache
 * write) and the `cache` attribute. Each trace touched here carries `session_owner: native`.
 */
const activeTrace = (channelId: string): PerfTrace | undefined => {
    const trace = getActivePerfTrace('chat_room_sync', channelId);
    trace?.putAttribute(SESSION_OWNER_ATTRIBUTE, 'native');
    return trace;
};

/** Marks the prime's entry. */
export const markPrimeAsked = (channelId: string): void => activeTrace(channelId)?.mark('verified');

/**
 * Takes the room's trace for a fetch about to be asked, if no fetch has taken it yet, and marks the rest
 * when `result` settles. Ask it only for a fetch that will run: a prefetch whose cloud socket is not
 * verified must leave the trace to the room's own fetch. A fetch that answers `null` (a prefetch that
 * failed) or rejects ends the trace as `error`, as the owning fetch does in-process.
 */
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
