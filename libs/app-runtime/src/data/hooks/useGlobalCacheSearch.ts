import { useCallback } from 'react';
import { globalCacheRefKey } from '@chatic/data';
import type { GlobalCacheContext, GlobalCacheRef, GlobalCacheSearchResult } from '@chatic/data';

import { runtimeData } from '../dataCommands';

/**
 * Cross-cloud reads over the local cache (see docs/specs/cache/global-cache-search.md):
 * `search` finds matches in any cached cloud, `resolveContext` reads the rows a result row needs
 * around it (owning channel/place, my read cursor, newest message) — the only supported way to
 * read outside the active cloud, since repositories are scoped to it.
 *
 * Through the engine, which reads the account at call time — not captured at hook-creation time — so
 * a login/logout between renders is reflected without a stale closure. Signed out, both answer empty.
 */
export const useGlobalCacheSearch = () => {
    const search = useCallback((keyword: string, options?: { cid?: string }): Promise<GlobalCacheSearchResult> => {
        // The account is the engine's to read, at call time: a sign-in or out between renders counts.
        return runtimeData().searchCache(keyword, options);
    }, []);

    const resolveContext = useCallback(
        (refs: { cids: string[]; channelRefs: GlobalCacheRef[] }): Promise<GlobalCacheContext> => {
            return runtimeData().resolveCacheContext(refs);
        },
        []
    );

    return { search, resolveContext };
};

/**
 * Key for every {@link GlobalCacheContext} map, re-exported so consumers read the maps without
 * importing `@chatic/data` directly (apps consume this barrel — see ADR-0036's bypass inventory)
 * and without re-deriving the key format.
 */
export { globalCacheRefKey };
