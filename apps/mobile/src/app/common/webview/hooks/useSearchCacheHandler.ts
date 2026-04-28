import { useCallback } from 'react';
import { logger } from '../../services';
import { cacheSearchService } from '../../storages';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, SearchGlobalCache } from '@chatic/app-messages';

export const useSearchCacheHandler = (bridge: WebViewBridge) => {
    const handleSearchGlobalCache = useCallback(
        async (message: SearchGlobalCache) => {
            try {
                const items = await cacheSearchService.executeGlobalSearch(message.data.keyword, message.data.cid);

                const response: AppMessageData<'OnSearchGlobalCache'> = {
                    type: 'OnSearchGlobalCache',
                    nonce: message.nonce,
                    data: { items } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Search execution failed`, e);
                bridge.post({ type: 'OnSearchGlobalCache', nonce: message.nonce, data: { items: [] } as any });
            }
        },
        [bridge]
    );

    return { handleSearchGlobalCache };
};
