import { useCallback } from 'react';
import { useServices } from '../../hooks';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, OnSearchGlobalCacheDataPayload, SearchGlobalCacheData } from '@chatic/app-messages';

export const useSearchCacheHandler = (bridge: WebViewBridge) => {
    const { cacheSearchService, logService: logger } = useServices();

    const handleSearchGlobalCache = useCallback(
        async (message: SearchGlobalCacheData) => {
            const { keyword, cid, uid } = message.data;
            try {
                const items = await cacheSearchService.search(keyword, cid, uid);

                const payload: OnSearchGlobalCacheDataPayload = { items };
                const response: AppMessageData<'OnSearchGlobalCacheData'> = {
                    type: 'OnSearchGlobalCacheData',
                    nonce: message.nonce,
                    data: payload,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Search execution failed for keyword: ${keyword}`, e);
                const errorPayload: OnSearchGlobalCacheDataPayload = { items: [] };
                bridge.post({
                    type: 'OnSearchGlobalCacheData',
                    nonce: message.nonce,
                    data: errorPayload,
                });
            }
        },
        [bridge, cacheSearchService, logger]
    );

    return { handleSearchGlobalCache };
};
