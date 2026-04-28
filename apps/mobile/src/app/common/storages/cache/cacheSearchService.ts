import { channelDataSource, chatDataSource } from './sqlite';
import { logger } from '../services';
import type { CacheChannelView, CacheChatView } from '@chatic/app-messages';

export const cacheSearchService = {
    /**
     * Performs a global search across multiple data sources (e.g., Channels, Chats).
     * This service acts as an orchestrator for complex, cross-domain queries.
     *
     * @param keyword The search term to look for.
     * @param cid Optional Cloud ID to scope the search.
     * @returns A promise that resolves to an array of combined and sorted search results.
     */
    executeGlobalSearch: async (keyword: string, cid?: string): Promise<(CacheChannelView | CacheChatView)[]> => {
        if (!keyword || keyword.trim() === '') {
            return [];
        }

        try {
            // Execute queries concurrently for maximum performance
            const [channels, chats] = await Promise.all([
                channelDataSource.fetchChannels(cid, undefined, keyword),
                chatDataSource.fetchChats(cid, undefined, 'desc', keyword),
            ]);

            // Tag each result with its domain for the frontend to differentiate
            const formattedChannels = channels.map(item => ({ ...item, _domain: 'channel' }));
            const formattedChats = chats.map(item => ({ ...item, _domain: 'chat' }));

            const combinedResults = [...formattedChannels, ...formattedChats];

            // Sort all results chronologically (newest first)
            return combinedResults.sort((a, b) => ((b.createdAt as number) || 0) - ((a.createdAt as number) || 0));
        } catch (error) {
            logger.error('CACHE', `Failed to execute global search for keyword: ${keyword}`, error);
            return [];
        }
    },
};
