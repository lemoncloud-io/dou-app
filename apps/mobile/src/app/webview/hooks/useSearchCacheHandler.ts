import { useCallback } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import type { WebMessageData } from '@chatic/app-messages';

export const useSearchCacheHandler = () => {
    const { logService: logger } = useServices();
    // `provider.cacheSearchService` is read inside the callback (not at render) so SQLite opens on the
    // first actual search message, off the boot critical path (boot-optimization.md 4.4).

    const handleSearchGlobalCache = useCallback(
        async (message: WebMessageData<'SearchGlobalCacheData'>) => {
            const { keyword, cid, uid } = message.data;
            try {
                const items = await provider.cacheSearchService.search(keyword, cid, uid);
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
        [logger]
    );

    return { handleSearchGlobalCache };
};
