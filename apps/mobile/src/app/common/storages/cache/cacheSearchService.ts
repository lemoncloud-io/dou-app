import { channelDataSource, chatDataSource, siteDataSource } from './sqlite';
import { logger } from '../../services';
import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/app-messages';

export const cacheSearchService = {
    executeGlobalSearch: async (
        keyword: string,
        cid?: string
    ): Promise<(CacheChannelView | CacheChatView | CacheSiteView)[]> => {
        if (!keyword || keyword.trim() === '') return [];

        try {
            const [channels, chats, sites] = await Promise.all([
                channelDataSource.fetchAll(cid, { keyword }),
                chatDataSource.fetchAll(cid, { keyword }),
                siteDataSource.fetchAll(cid, { keyword }),
            ]);

            const formattedChannels = channels.map(item => ({ ...item, _domain: 'channel' as const }));
            const formattedChats = chats.map(item => ({ ...item, _domain: 'chat' as const }));
            const formattedSites = sites.map(item => ({ ...item, _domain: 'site' as const }));

            const combinedResults = [...formattedChannels, ...formattedChats, ...formattedSites];

            return combinedResults.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));
        } catch (error) {
            logger.error('CACHE', `Failed global search for: ${keyword}`, error);
            return [];
        }
    },
};
