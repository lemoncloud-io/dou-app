import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

interface UseReadMarkerParams {
    channelId: string;
    // channel.chatNo — the room's latest chat number, available before messages load.
    channelChatNo?: number;
    // The latest committed (non-pending/failed) message's chatNo, once messages are loaded.
    lastChatNo?: number;
    isVerified: boolean;
    readMessage: (payload: { channelId: string; chatNo: number }) => Promise<unknown>;
}

/**
 * Marks the room read as the user sees its latest messages, in two stages so the read lands
 * as early as possible:
 *  1. On entry, send `channel.chatNo` immediately — no need to wait for messages to load.
 *  2. After messages load, correct upward to the latest committed message, and re-mark on
 *     foreground return (visibilitychange). Messages surfaced by the foreground refetch
 *     (useForegroundChatRefresh) advance `lastChatNo`, which re-runs this effect.
 *
 * `lastReadChatNoRef` dedups redundant reads (never send a chatNo we've already marked) and is
 * reset to null on failure so the next opportunity retries. `markSent` is exposed for the send
 * path: a just-sent message is read by definition, so callers advance the cursor through it.
 */
export const useReadMarker = ({
    channelId,
    channelChatNo,
    lastChatNo,
    isVerified,
    readMessage,
}: UseReadMarkerParams) => {
    // Highest chatNo already marked read (null = nothing marked yet / reset after a failure).
    const lastReadChatNoRef = useRef<number | null>(null);

    // Stage 1: read on entry straight from channel.chatNo, without waiting for the message load.
    useEffect(() => {
        if (!channelId || !channelChatNo || !isVerified || document.visibilityState === 'hidden') return;
        if (lastReadChatNoRef.current !== null && channelChatNo <= lastReadChatNoRef.current) return;

        lastReadChatNoRef.current = channelChatNo;
        readMessage({ channelId, chatNo: channelChatNo }).catch(error => {
            lastReadChatNoRef.current = null;
            logger.error('CHAT', 'Failed to read on channel entry', {
                error,
                data: { channelId, chatNo: channelChatNo },
            });
        });
    }, [channelChatNo, channelId, readMessage, isVerified]);

    // Stage 2: correct upward once messages load, and re-mark on foreground return / resync.
    useEffect(() => {
        if (!channelId || lastChatNo === undefined || !isVerified) return;

        const handleAutoRead = () => {
            if (document.visibilityState === 'hidden') return;
            if (lastReadChatNoRef.current !== null && lastChatNo <= lastReadChatNoRef.current) return;

            lastReadChatNoRef.current = lastChatNo;
            readMessage({ channelId, chatNo: lastChatNo }).catch(error => {
                lastReadChatNoRef.current = null;
                logger.error('CHAT', 'Failed to read latest message', {
                    error,
                    data: { channelId, chatNo: lastChatNo },
                });
            });
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') {
                // Reset the guard on foreground so a request lost while hidden is re-sent.
                lastReadChatNoRef.current = null;
                handleAutoRead();
            }
        };

        handleAutoRead();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [lastChatNo, channelId, readMessage, isVerified]);

    // Mark a just-sent message read (the sender has read it by definition). Advances the guard
    // so the auto-read effects don't re-send the same chatNo.
    const markSent = useCallback(
        (chatNo: number) => {
            lastReadChatNoRef.current = chatNo;
            readMessage({ channelId, chatNo }).catch(error => {
                logger.error('CHAT', 'Failed to read sent message', { error, data: { channelId, chatNo } });
            });
        },
        [channelId, readMessage]
    );

    return { markSent };
};
