import { useCallback, useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { endPerfTrace, getActivePerfTrace } from '@chatic/perf';

import { useAppForeground } from '../../../bridge';
import { readSelectedCloudId } from '../../../hooks/useCloudScope';

/**
 * Fills the missed-push gap for a chat room. The chat plan has no polling — it relies on live
 * push + reconnect catch-up — so pushes missed while the WebView was suspended leave the cache
 * stale with no path to recover.
 *
 * This hook is the deliberate complement of usePrimeChat (app-runtime): prime fetches only when
 * the cache is COLD, so this hook fetches only when the cache is WARM. Together every room entry
 * fetches exactly once. Keep the two conditions mirrored if either policy changes.
 *
 * Runs on entry (covers push-tap: the foreground signal passes before the room mounts) and on
 * every foreground return while mounted. Before fetching, the plan baseline is re-aligned to the
 * cached max chatNo (same pattern as prime) so the next reconnect catch-up starts from the right
 * cursor instead of re-pulling what the fetch already merged.
 *
 * The cache read, the baseline and the fetch all have to be about one cloud, and the app graph picks
 * its cloud from the selection each time a call starts. So the cloud is taken once, before the read;
 * the baseline goes to that cloud by name; and if the selection has moved by the time the read comes
 * back, nothing else happens — the baseline would describe the wrong cloud's cache, and the fetch
 * would ask the next cloud for a channel that is not its own.
 */
export const useForegroundChatRefresh = (channelId: string): void => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const refreshIfWarm = useCallback(async () => {
        if (!channelId) return;
        // Read at call time, not from render: this is the cloud the read below is about to resolve to.
        const cid = readSelectedCloudId();
        const cached = await chatRepository.cacheReadList({ channelId });
        if (readSelectedCloudId() !== cid) return;
        const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);
        // Cold room: usePrimeChat owns the first fetch — fetching here too would double it.
        if (lastNo === 0) return;

        runtime.sync
            .getSyncManager()
            .updateLocalSnapshot(
                { type: 'chat', id: channelId },
                { id: channelId, lastNo, minNo: 0, messages: [] },
                { cid }
            );
        // A warm room's sync is this fetch, so it marks the phases of the `chat_room_sync` trace a
        // room being opened has in progress (a cold room's are usePrimeChat's). The room page ends
        // the trace when the fetched page reaches the screen.
        // The first fetch for a trace owns it (a foreground return during the same wait does not).
        const active = getActivePerfTrace('chat_room_sync', channelId);
        const trace = active && !active.hasMetric('feed_sent') ? active : undefined;
        trace?.putAttribute('cache', 'hit');
        trace?.mark('feed_sent');
        let result;
        try {
            // `feed_received` splits the wait into the server round trip and the cache write after it.
            result = await chatRepository.refreshList({ channelId }, { onFetched: () => trace?.mark('feed_received') });
        } catch (error) {
            // Only the fetch that took the trace ends it. A foreground refresh failing while the entry's
            // own fetch is still running would otherwise close that trace as an error it never had.
            if (trace) endPerfTrace('chat_room_sync', trace, 'error');
            throw error;
        }
        trace?.putMetric('fetched', result.fetchedCount);
        trace?.putMetric('latest_no', result.latestNo);
        trace?.mark('feed_done');
        if (trace && result.fetchedCount === 0) endPerfTrace('chat_room_sync', trace, 'synced');
    }, [chatRepository, channelId]);

    // Entry (and re-verification): a warm room may hide a missed-push gap behind its cache.
    useEffect(() => {
        if (!isVerified) return;
        getActivePerfTrace('chat_room_sync', channelId)?.mark('verified');
        refreshIfWarm().catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] entry refresh failed', {
                error,
                data: { channelId },
            });
        });
    }, [isVerified, channelId, refreshIfWarm]);

    // Foreground return while the room stays mounted. Unlike the entry effect this does NOT gate
    // on `isVerified`: gating here meant a socket that resumed verified-stuck/zombie (no
    // false→true edge to re-fire the entry effect) left the room permanently stale — the exact
    // missed-push-on-resume gap this hook exists to close. SocketManager.request does NOT
    // self-heal auth (the SDK AuthController owns re-auth; useSocketWakeRecovery kicks a wedged
    // socket on this same foreground signal), so a fire on a dead session just logs below and the
    // entry effect refetches on the next verified rising edge.
    useAppForeground(() => {
        refreshIfWarm().catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] foreground refresh failed', {
                error,
                data: { channelId },
            });
        });
    });
};
