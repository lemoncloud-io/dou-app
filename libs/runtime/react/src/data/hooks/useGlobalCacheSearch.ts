import { useCallback } from 'react';

import { globalCacheRefKey, resolveCacheContext, searchCache } from '@chatic/runtime-client';
import type { GlobalCacheContext, GlobalCacheRef, GlobalCacheSearchResult } from '@chatic/runtime-client';

export const useGlobalCacheSearch = () => {
    const search = useCallback((keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult> => {
        return searchCache(keyword, options);
    }, []);

    const resolveContext = useCallback(
        (refs: { cids: string[]; channelRefs: GlobalCacheRef[] }): Promise<GlobalCacheContext> =>
            resolveCacheContext(refs),
        []
    );

    return { search, resolveContext };
};

export { globalCacheRefKey };
