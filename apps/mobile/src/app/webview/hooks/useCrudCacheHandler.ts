import { useMemo } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import { createCacheMessageHandlers } from '../../services/cache/cacheMessages';

export const useCrudCacheHandler = () => {
    const { logService: logger } = useServices();

    return useMemo(() => {
        const handlers = createCacheMessageHandlers({
            crud: () => provider.cacheCrudService,
            search: () => provider.cacheSearchService,
            logger,
        });
        return {
            handleFetchAllCache: handlers.FetchAllCacheData,
            handleFetchCache: handlers.FetchCacheData,
            handleFetchLastChats: handlers.FetchLastChatsData,
            handleFetchManyCache: handlers.FetchManyCacheData,
            handleSaveCache: handlers.SaveCacheData,
            handleSaveAllCache: handlers.SaveAllCacheData,
            handleDeleteCache: handlers.DeleteCacheData,
            handleDeleteAllCache: handlers.DeleteAllCacheData,
            handleClearCache: handlers.ClearCacheData,
            handleClearCacheByChannel: handlers.ClearCacheDataByChannel,
            handleFetchChatMediaCache: handlers.FetchChatMediaCacheData,
            handleCountChatMediaCache: handlers.CountChatMediaCacheData,
            handleSaveChatMediaCache: handlers.SaveChatMediaCacheData,
        };
    }, [logger]);
};
