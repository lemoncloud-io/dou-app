import { useCallback, useEffect } from 'react';

import { runtime } from '@chatic/runtime';
import { logger } from '@chatic/bridges';
import { getActivePerfTrace } from '@chatic/perf';

import { useAppForeground } from '../../../bridge';
import { readSelectedCloudId } from '../../../hooks/useCloudScope';

export const useForegroundChatRefresh = (channelId: string): void => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();

    const refreshIfWarm = useCallback(
        async ({ fresh = false }: { fresh?: boolean } = {}) => {
            if (!channelId) return;
            const cid = readSelectedCloudId();
            const cached = await chatRepository.cacheReadList({ channelId });
            if (readSelectedCloudId() !== cid) return;
            const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);
            if (lastNo === 0) return;

            runtime.sync.updateSyncSnapshot(
                { type: 'chat', id: channelId },
                { id: channelId, lastNo, minNo: 0, messages: [] },
                { cid }
            );
            await runtime.sync.fetchRoomFeed(cid, channelId, { cache: 'hit', fresh });
        },
        [chatRepository, channelId]
    );

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

    useAppForeground(() => {
        refreshIfWarm({ fresh: true }).catch(error => {
            logger.warn('CHAT', '[useForegroundChatRefresh] foreground refresh failed', {
                error,
                data: { channelId },
            });
        });
    });
};
