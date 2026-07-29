import { useCallback } from 'react';
import type { GlobalCacheSearchResult } from '@chatic/data';
import { getGlobalCacheSearchSource } from '../data/factories/localFactory';
import { getDataManager } from '../data/runtime';

const EMPTY_RESULT: GlobalCacheSearchResult = { channels: [], sites: [], chats: [] };

/**
 * Cross-cloud keyword search over the local cache (see docs/specs/cache/global-cache-search.md).
 * `uid` is read from the live data context at call time, not captured at hook-creation time,
 * so a login/logout between renders is reflected without a stale closure.
 */
export const useGlobalCacheSearch = () => {
    const search = useCallback((keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult> => {
        const { uid } = getDataManager().getContext();
        if (!uid) return Promise.resolve(EMPTY_RESULT);

        return getGlobalCacheSearchSource().search(keyword, { uid, cid: options?.cid });
    }, []);

    return { search };
};
