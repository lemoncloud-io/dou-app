import { useMemo } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import { createCacheMessageHandlers } from '../../services/cache/cacheMessages';

/**
 * The cache's CRUD messages from the page. How each is answered lives in `createCacheMessageHandlers`,
 * which a runtime in this process answers its own cache reads with too.
 */
export const useCrudCacheHandler = () => {
    const { logService: logger } = useServices();

    return useMemo(() => {
        // `provider.cacheCrudService` is read on each message (not at render) so the SQLite database
        // opens on the first actual cache message, off the boot critical path (boot-optimization.md 4.4).
        // `provider` is a stable module singleton, so the handlers need not depend on the service.
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
        };
    }, [logger]);
};
