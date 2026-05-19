import { useCallback } from 'react';
import { useServices } from '../../hooks';
import type { OnSearchGlobalCacheDataPayload, SearchGlobalCacheData } from '@chatic/app-messages';

export const useSearchCacheHandler = () => {
    const { cacheSearchService, logService: logger } = useServices();

    const handleSearchGlobalCache = useCallback(
        async (payload: SearchGlobalCacheData['data']): Promise<OnSearchGlobalCacheDataPayload> => {
            const { keyword, cid, uid } = payload;
            try {
                const items = await cacheSearchService.search(keyword, cid, uid);
                return { items };
            } catch (e) {
                logger.error('CACHE', `Search execution failed for keyword: ${keyword}`, e);
                // Return empty array on error to prevent webview from hanging
                return { items: [] };
            }
        },
        [cacheSearchService, logger]
    );

    return { handleSearchGlobalCache };
};
