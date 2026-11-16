import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/app-runtime';
import { logger } from '@chatic/bridges';

import { readSelectedCloudId } from '../../../hooks/useCloudScope';

export interface ChannelHeadRefreshParams {
    channelId: string;
    /** The channel record's newest message number (`channel.chatNo`), kept live by the channel's sync. */
    channelChatNo?: number;
    /** The newest message number the room's cache window holds, before any filtering for display. */
    cachedNewestNo: number;
    /** Whether that window has been read from the cache yet — before that, `cachedNewestNo` means nothing. */
    isCacheRead: boolean;
}

/**
 * Catches an open room up when the channel record knows of a message its cache does not.
 *
 * A room otherwise learns of a new message only through its chat target's `chat.sync` push: the chat
 * plan does not poll, and the room re-reads its newest page only on entry and on foreground return
 * (`useForegroundChatRefresh`). As the server behaves today, that push leaves out the author's own
 * devices, so a message the same account sends from another device never reached a room left open
 * here. The channel record does reach it — the channel target polls `channel.get`, and `channel.sync`
 * moves it sooner — so when its `chatNo` runs ahead of the cache, this fetches the newest page.
 *
 * It fetches once per number, not on a timer: nothing here polls, it only reads a number that is
 * already arriving. The number is remembered per cloud and channel for as long as the hook is mounted,
 * so a number the newest page never carries (a deleted message, for one) does not refetch on every
 * render. A fetch that fails gives the number back, so the next change to either side tries again.
 *
 * The fetch goes through `fetchRoomFeed`, joining a fetch for the room already in flight — on entry
 * that is the entry refresh's, so entering a room does not add a request of its own. Joining can also
 * hand back a page that finished just before the number moved; when that page stops short of the
 * number, the cache has not caught up by another route, and the room is still the one on screen, one
 * fresh request follows.
 *
 * A cold room is left to the prime, which owns the first page.
 */
export const useChannelHeadRefresh = ({
    channelId,
    channelChatNo,
    cachedNewestNo,
    isCacheRead,
}: ChannelHeadRefreshParams): void => {
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const askedRef = useRef<{ key: string; no: number } | null>(null);
    // Read after an await, when the window may have caught up through a push in the meantime.
    const cachedNewestRef = useRef(cachedNewestNo);
    cachedNewestRef.current = cachedNewestNo;
    // The room this hook is showing now, also read after the await: a retry for a room already left is
    // a request nobody will look at, and the window it would compare against belongs to another room.
    const liveChannelRef = useRef<string | null>(null);
    useEffect(() => {
        liveChannelRef.current = channelId;
        return () => {
            liveChannelRef.current = null;
        };
    }, [channelId]);

    useEffect(() => {
        if (!channelId || !channelChatNo || !isVerified || !isCacheRead) return;
        if (cachedNewestNo === 0 || channelChatNo <= cachedNewestNo) return;
        const cid = readSelectedCloudId();
        const key = `${cid}:${channelId}`;
        const asked = askedRef.current;
        if (asked && asked.key === key && asked.no >= channelChatNo) return;

        const target = { key, no: channelChatNo };
        askedRef.current = target;
        void (async () => {
            const page = await runtime.sync.fetchRoomFeed(cid, channelId, { cache: 'hit' });
            if (liveChannelRef.current !== channelId || readSelectedCloudId() !== cid) return;
            if (page.latestNo >= target.no || cachedNewestRef.current >= target.no) return;
            await runtime.sync.fetchRoomFeed(cid, channelId, { cache: 'hit', fresh: true });
        })().catch(error => {
            // Only this fetch's own number: a newer one has replaced it and is being fetched already.
            if (askedRef.current === target) askedRef.current = null;
            logger.warn('chat.head_refresh_failed', '[useChannelHeadRefresh] could not fetch the newest page', {
                error,
                data: { channelId, channelChatNo: target.no },
            });
        });
    }, [channelId, channelChatNo, cachedNewestNo, isCacheRead, isVerified]);
};
