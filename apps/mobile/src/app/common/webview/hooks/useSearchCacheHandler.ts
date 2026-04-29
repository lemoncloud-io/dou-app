import { useCallback } from 'react';
import { logger } from '../../services';
import { cacheSearchService } from '../../storages';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, SearchGlobalCacheData } from '@chatic/app-messages';

export const useSearchCacheHandler = (bridge: WebViewBridge) => {
    const handleSearchGlobalCache = useCallback(
        async (message: SearchGlobalCacheData) => {
            try {
                const items = await cacheSearchService.executeGlobalSearch(message.data.keyword, message.data.cid);

                const response: AppMessageData<'OnSearchGlobalCacheData'> = {
                    type: 'OnSearchGlobalCacheData',
                    nonce: message.nonce,
                    data: { items },
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Search execution failed`, e);
                bridge.post({ type: 'OnSearchGlobalCacheData', nonce: message.nonce, data: { items: [] } as any });
            }
        },
        [bridge]
    );

    return { handleSearchGlobalCache };
};
