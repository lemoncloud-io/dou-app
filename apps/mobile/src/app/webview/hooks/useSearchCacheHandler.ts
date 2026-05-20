import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { WebMessageData } from '@chatic/app-messages';

export const useSearchCacheHandler = () => {
    const { cacheSearchService, logService: logger } = useServices();

    const handleSearchGlobalCache = useCallback(
        async (message: WebMessageData<'SearchGlobalCacheData'>) => {
            const { keyword, cid, uid } = message.payload;
            try {
                const items = await cacheSearchService.search(keyword, cid, uid);
                return { type: 'OnSearchGlobalCacheData' as const, success: true, data: { items } };
            } catch (e: any) {
                logger.error('CACHE', `Search execution failed for keyword: ${keyword}`, e);
                return {
                    type: 'OnSearchGlobalCacheData' as const,
                    success: false,
                    error: { code: 'SEARCH_ERROR', message: e.message },
                };
            }
        },
        [cacheSearchService, logger]
    );

    return { handleSearchGlobalCache };
};
