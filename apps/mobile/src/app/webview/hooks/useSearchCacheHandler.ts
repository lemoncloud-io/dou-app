import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { OnSearchGlobalCacheDataPayload, SearchGlobalCacheData } from '@chatic/app-messages';

export const useSearchCacheHandler = () => {
    const { cacheSearchService, logService: logger } = useServices();

    const handleSearchGlobalCache = useCallback(
        async (message: SearchGlobalCacheData): Promise<{ data: OnSearchGlobalCacheDataPayload }> => {
            const { keyword, cid, uid } = message.data;
            try {
                const items = await cacheSearchService.search(keyword, cid, uid);
                return { data: { items } };
            } catch (e) {
                logger.error('CACHE', `Search execution failed for keyword: ${keyword}`, e);
                // Return empty array on error to prevent webview from hanging
                return { data: { items: [] } };
            }
        },
        [cacheSearchService, logger]
    );

    return { handleSearchGlobalCache };
};
