import { useMemo } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import { createCacheMessageHandlers } from '../../services/cache/cacheMessages';

/** The page's search across clouds. Answered by `createCacheMessageHandlers`, as the CRUD messages are. */
export const useSearchCacheHandler = () => {
    const { logService: logger } = useServices();

    return useMemo(() => {
        // `provider.cacheSearchService` is read on each message (not at render) so SQLite opens on the
        // first actual search message, off the boot critical path (boot-optimization.md 4.4).
        const handlers = createCacheMessageHandlers({
            crud: () => provider.cacheCrudService,
            search: () => provider.cacheSearchService,
            logger,
        });
        return { handleSearchGlobalCache: handlers.SearchGlobalCacheData };
    }, [logger]);
};
