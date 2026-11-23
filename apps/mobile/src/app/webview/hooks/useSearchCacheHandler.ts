import { useMemo } from 'react';
import { useServices } from '../../hooks';
import { provider } from '../../services';
import { createCacheMessageHandlers } from '../../services/cache/cacheMessages';

export const useSearchCacheHandler = () => {
    const { logService: logger } = useServices();

    return useMemo(() => {
        const handlers = createCacheMessageHandlers({
            crud: () => provider.cacheCrudService,
            search: () => provider.cacheSearchService,
            logger,
        });
        return { handleSearchGlobalCache: handlers.SearchGlobalCacheData };
    }, [logger]);
};
