import { useCallback, useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';
import { getActivePerfTrace } from '@chatic/perf';

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
 * back, nothing else happens — the baseline would describe the wrong cloud's cache.
 *
 * The fetch goes through `runtime.sync.fetchRoomFeed`, which joins the room's fetch already in flight
 * — the one the home list's tap starts — rather than sending a second request.
 */
export const useForegroundChatRefresh = (channelId: string): void => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const refreshIfWarm = useCallback(
        async ({ fresh = false }: { fresh?: boolean } = {}) => {
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
            // A warm room's sync is this fetch (a cold room's is usePrimeChat's). `fetchRoomFeed` joins a
            // fetch the tap already started, marks the `chat_room_sync` phases if it is the first fetch for
            // the trace, and ends the trace itself on failure. The room page ends it otherwise.
            await runtime.sync.fetchRoomFeed(cid, channelId, { cache: 'hit', fresh });
        },
        [chatRepository, channelId]
    );

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
    // `fresh`: a fetch still in flight may have been sent before the app was suspended, and could
    // answer with a page from before the pushes this refresh exists to recover.
    useAppForeground(() => {
        refreshIfWarm({ fresh: true }).catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] foreground refresh failed', {
                error,
                data: { channelId },
            });
        });
    });
};
