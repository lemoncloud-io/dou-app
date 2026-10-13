import { useCallback, useEffect, useRef } from 'react';

import { logger } from '@chatic/bridges';

import { readMarkRegistry } from '../../../runtime/logging/readMarkRegistry';

type MarkRead = (cid: string, input: { channelId: string; chatNo: number }) => Promise<void>;

interface UseReadMarkerParams {
    /** The room's own cloud — where its read cursor lives and where the read has to go. */
    cid: string;
    channelId: string;
    // channel.chatNo — the room's latest chat number, available before messages load.
    channelChatNo?: number;
    // The latest committed (non-pending/failed) message's chatNo, once messages are loaded.
    lastChatNo?: number;
    /**
     * The room cloud's `join.readChat`: moves the local cursor at once and hands the server half to the
     * outbox, which sends it when the cloud's socket can carry it. Resolves when the server accepted the
     * read, rejects only when it refused it for good.
     */
    markRead: MarkRead;
}

/**
 * Marks the room read as the user sees its latest messages, in two stages so the read lands
 * as early as possible:
 *  1. On entry, mark `channel.chatNo` immediately — no need to wait for messages to load.
 *  2. After messages load, correct upward to the latest committed message, and re-mark on
 *     foreground return (visibilitychange). Messages surfaced by the foreground refetch
 *     (useForegroundChatRefresh) advance `lastChatNo`, which re-runs this effect.
 *
 * Neither stage waits for the socket. `markRead` writes the cursor the unread badge is computed from
 * right away and owns delivering it to the server, retries included — so a room entered while the
 * socket reconnects is read the moment it is seen, and leaving before the socket is back does not
 * lose the read.
 *
 * `markedRef` only dedups what this room already handed over, and is scoped to the room: the route
 * keeps this page mounted from one room to the next, and a guard carried across would skip the next
 * room's read whenever its head is lower than the last room's. `markSent` is exposed for the send
 * path: a just-sent message is read by definition, so callers advance the cursor through it.
 */
export const useReadMarker = ({ cid, channelId, channelChatNo, lastChatNo, markRead }: UseReadMarkerParams) => {
    // Highest chatNo handed to markRead for the room named by `room`.
    const markedRef = useRef<{ room: string; chatNo: number } | null>(null);

    const mark = useCallback(
        (chatNo: number, failure: string) => {
            if (!channelId) return;
            const room = `${cid}|${channelId}`;
            const marked = markedRef.current;
            if (marked?.room === room && chatNo <= marked.chatNo) return;

            markedRef.current = { room, chatNo };
            markRead(cid, { channelId, chatNo })
                // Record only what the server accepted: the divergence check asks whether the cache
                // followed a read the room actually completed, so an optimistic value would make a
                // failed read look like a cache that fell behind.
                .then(() => readMarkRegistry.record(channelId, chatNo))
                .catch(error => {
                    logger.error('CHAT', failure, { error, data: { channelId, chatNo } });
                });
        },
        [channelId, cid, markRead]
    );

    // Stage 1: read on entry straight from channel.chatNo, without waiting for the message load.
    useEffect(() => {
        if (!channelChatNo || document.visibilityState === 'hidden') return;
        mark(channelChatNo, 'Failed to read on channel entry');
    }, [channelChatNo, mark]);

    // Stage 2: correct upward once messages load, and re-mark on foreground return.
    useEffect(() => {
        if (lastChatNo === undefined) return;

        const handleAutoRead = () => {
            if (document.visibilityState === 'hidden') return;
            mark(lastChatNo, 'Failed to read latest message');
        };

        const handleVisibilityChange = () => {
            if (document.visibilityState === 'visible') handleAutoRead();
        };

        handleAutoRead();
        document.addEventListener('visibilitychange', handleVisibilityChange);

        return () => {
            document.removeEventListener('visibilitychange', handleVisibilityChange);
        };
    }, [lastChatNo, mark]);

    // Mark a just-sent message read (the sender has read it by definition).
    const markSent = useCallback((chatNo: number) => mark(chatNo, 'Failed to read sent message'), [mark]);

    return { markSent };
};
