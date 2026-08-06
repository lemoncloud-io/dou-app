import { useCallback } from 'react';
import type { GlobalCacheContext, GlobalCacheRef, GlobalCacheSearchResult } from '@chatic/data';
import { getGlobalCacheSearchSource } from '../data/factories/localFactory';
import { getDataManager } from '../data/runtime';

const EMPTY_RESULT: GlobalCacheSearchResult = { channels: [], sites: [], chats: [] };
const EMPTY_CONTEXT: GlobalCacheContext = {
    channelsByRef: {},
    sitesByRef: {},
    joinsByRef: {},
    lastChatsByRef: {},
};

/**
 * Cross-cloud reads over the local cache (see docs/specs/cache/global-cache-search.md):
 * `search` finds matches in any cached cloud, `resolveContext` reads the rows a result row needs
 * around it (owning channel/place, my read cursor, newest message) — the only supported way to
 * read outside the active cloud, since repositories are scoped to it.
 *
 * `uid` is read from the live data context at call time, not captured at hook-creation time,
 * so a login/logout between renders is reflected without a stale closure.
 */
export const useGlobalCacheSearch = () => {
    const search = useCallback((keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult> => {
        const { uid } = getDataManager().getContext();
        if (!uid) return Promise.resolve(EMPTY_RESULT);

        return getGlobalCacheSearchSource().search(keyword, { uid, cid: options?.cid });
    }, []);

    const resolveContext = useCallback(
        (refs: { cids: string[]; channelRefs: GlobalCacheRef[] }): Promise<GlobalCacheContext> => {
            const { uid } = getDataManager().getContext();
            if (!uid) return Promise.resolve(EMPTY_CONTEXT);

            return getGlobalCacheSearchSource().resolveContext({ uid, ...refs });
        },
        []
    );

    return { search, resolveContext };
};
