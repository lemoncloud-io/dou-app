import { useCallback } from 'react';
import { logger } from '../../services';
import { cacheSearchService } from '../../storages';

import type { WebViewBridge } from './useBaseBridge';
import type { AppMessageData, ExecuteGlobalSearch } from '@chatic/app-messages';

export const useSearchCacheHandler = (bridge: WebViewBridge) => {
    const handleExecuteGlobalSearch = useCallback(
        async (message: ExecuteGlobalSearch) => {
            try {
                const items = await cacheSearchService.executeGlobalSearch(message.data.keyword, message.data.cid);

                const response: AppMessageData<'OnExecuteGlobalSearch'> = {
                    type: 'OnExecuteGlobalSearch',
                    nonce: message.nonce,
                    data: { items } as any,
                };
                bridge.post(response);
            } catch (e) {
                logger.error('CACHE', `Search execution failed`, e);
                bridge.post({ type: 'OnExecuteGlobalSearch', nonce: message.nonce, data: { items: [] } as any });
            }
        },
        [bridge]
    );

    return { handleExecuteGlobalSearch };
};
