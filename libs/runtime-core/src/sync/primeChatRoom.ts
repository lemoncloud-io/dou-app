import { logger } from '@chatic/logger';
import { getActivePerfTrace } from '@chatic/perf';
import { fetchRoomFeed, getSyncManager } from '@chatic/sync';

import { getDataManager } from '../data/runtime';

export type ChatPrimeOutcome = 'ready' | 'failed' | 'cancelled';

export interface PrimeChatRoomOptions {
    cancelled?: () => boolean;
}

export const primeChatRoom = async (
    cid: string,
    channelId: string,
    { cancelled = () => false }: PrimeChatRoomOptions = {}
): Promise<ChatPrimeOutcome> => {
    getActivePerfTrace('chat_room_sync', channelId)?.mark('verified');
    try {
        const repos = getDataManager().getScopedRepositories(cid);
        const cached = await repos.chat.cacheReadList({ channelId });
        if (cancelled()) return 'cancelled';
        const lastNo = (cached?.list ?? []).reduce((max, chat) => (chat.chatNo > max ? chat.chatNo : max), 0);

        getSyncManager().updateLocalSnapshot(
            { type: 'chat', id: channelId },
            { id: channelId, lastNo, minNo: 0, messages: [] },
            { cid }
        );

        if (lastNo === 0) await fetchRoomFeed(cid, channelId, { cache: 'miss' });
        return 'ready';
    } catch (error) {
        logger.warn('SOCKET', '[useChatSync] Failed to prime chat target', {
            error,
            data: { channelId, cid },
        });
        return 'failed';
    }
};
