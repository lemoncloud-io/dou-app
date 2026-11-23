import { useEffect, useRef } from 'react';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';

import { readSelectedCloudId } from '../../../hooks/useCloudScope';

export interface ChannelHeadRefreshParams {
    channelId: string;
    channelChatNo?: number;
    cachedNewestNo: number;
    isCacheRead: boolean;
}

export const useChannelHeadRefresh = ({
    channelId,
    channelChatNo,
    cachedNewestNo,
    isCacheRead,
}: ChannelHeadRefreshParams): void => {
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const askedRef = useRef<{ key: string; no: number } | null>(null);
    const cachedNewestRef = useRef(cachedNewestNo);
    cachedNewestRef.current = cachedNewestNo;
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
            if (askedRef.current === target) askedRef.current = null;
            logger.warn('chat.head_refresh_failed', '[useChannelHeadRefresh] could not fetch the newest page', {
                error,
                data: { channelId, channelChatNo: target.no },
            });
        });
    }, [channelId, channelChatNo, cachedNewestNo, isCacheRead, isVerified]);
};
