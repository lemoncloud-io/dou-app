import { useCallback, useEffect } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { useAppForeground } from '../../../bridge';

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
 */
export const useForegroundChatRefresh = (channelId: string): void => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    const refreshIfWarm = useCallback(async () => {
        if (!channelId) return;
        const cached = await chatRepository.cacheReadList({ channelId });
        const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);
        // Cold room: usePrimeChat owns the first fetch — fetching here too would double it.
        if (lastNo === 0) return;

        getSyncManager().updateLocalSnapshot(
            { type: 'chat', id: channelId },
            { id: channelId, lastNo, minNo: 0, messages: [] }
        );
        await chatRepository.refreshList({ channelId });
    }, [chatRepository, channelId]);

    // Entry (and re-verification): a warm room may hide a missed-push gap behind its cache.
    useEffect(() => {
        if (!isVerified) return;
        refreshIfWarm().catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] entry refresh failed', {
                error,
                data: { channelId },
            });
        });
    }, [isVerified, channelId, refreshIfWarm]);

    // Foreground return while the room stays mounted. Unlike the entry effect this does NOT gate
    // on `isVerified`: the `feed` request routes through SocketManager.request, which self-heals a
    // 401 (re-auth + retry) or a disconnected socket (reconnect + retry). Gating here meant a
    // socket that resumed verified-stuck/zombie (no false→true edge to re-fire the entry effect)
    // left the room permanently stale — the exact missed-push-on-resume gap this hook exists to
    // close. Firing unconditionally lets the request layer re-establish auth on the way through.
    useAppForeground(() => {
        refreshIfWarm().catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] foreground refresh failed', {
                error,
                data: { channelId },
            });
        });
    });
};
