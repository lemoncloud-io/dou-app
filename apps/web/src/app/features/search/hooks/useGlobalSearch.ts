import { useEffect, useMemo, useState } from 'react';

import { useGlobalCacheSearch } from '@chatic/app-runtime';
import { useCloudSessionCatalog, useSessionSelection } from '@chatic/web-core';
import { logger } from '@chatic/bridges';
import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/app-messages';

import { useCachedCloudNames } from '../../home/hooks/useCachedCloudNames';
import { useInvitedClouds } from '../../home/hooks/useInvitedClouds';

// Inlined rather than importing `@chatic/shared`'s useDebounce: that package's root barrel
// re-exports ErrorFallback, which pulls in `@chatic/assets` — a mapping Jest's moduleNameMapper
// doesn't have (only `@chatic/lib/utils` and `@chatic/ui-kit/*` are special-cased in
// apps/web/jest.config.js), so any test importing this hook would fail to resolve.
const useDebounce = <T>(value: T, delay: number): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

/** See docs/specs/search/web-search-page.md — matches desktop-web's useMessageSearch constants. */
const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_SECTION = 20;
const MAX_MESSAGE_RESULTS = 30;

/**
 * Owned clouds (relay `CloudView`, from useCloudSessionCatalog) and invited clouds
 * (`DomainCloud`/`CacheCloudView`, from the local cloud cache) are two different types —
 * this is the minimal shape search needs from either, keyed by `id` (the same identifier
 * `switchCloud` and `selectedCloudId` use, see CloudSessionSheet.tsx).
 */
export interface CloudSearchResult {
    id: string;
    name?: string;
}

export interface GlobalSearchResults {
    clouds: CloudSearchResult[];
    places: CacheSiteView[];
    channels: CacheChannelView[];
    messages: CacheChatView[];
}

const EMPTY_RESULTS: GlobalSearchResults = { clouds: [], places: [], channels: [], messages: [] };

/** The cache-sourced half of the results — the cloud half is derived during render, see below. */
type CacheResults = Pick<GlobalSearchResults, 'places' | 'channels' | 'messages'>;

const EMPTY_CACHE_RESULTS: CacheResults = { places: [], channels: [], messages: [] };

/**
 * Debounced search over the ACTIVE cloud's local cache.
 *
 * Scope note: the cache search source can scan every cloud partition, but this screen asks for one
 * cloud. Cache rows are partitioned by `(cid, uid)` and `uid` comes from the ACTIVE session token
 * (contextStore.ts:45-47) — a cloud's rows are written under that cloud's uid, so from another
 * session (relay, or a different cloud) they are filtered out and the "every cloud" result set was
 * partial in a way the user could not predict. One cloud at a time is honest about what is
 * searchable. See ADR-0033.
 *
 * Cloud NAMES are still matched across all known clouds — they come from the catalog / invited /
 * cached-name sources, not from a cache scan, so they are unaffected by that partitioning and let
 * the user jump to another cloud from here.
 */
export const useGlobalSearch = (query: string) => {
    const trimmed = query.trim();
    const debounced = useDebounce(trimmed, DEBOUNCE_MS);
    const { search } = useGlobalCacheSearch();
    const { selectedCloudId } = useSessionSelection();
    // The relay session's rows live under the 'default' partition (useRuntimeBinding.ts:17).
    const activeCid = selectedCloudId ?? 'default';
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    // Third cloud-name source, and the only one that survives a lost cloud session: the relay
    // catalog is a REST read gated on `isAuthenticated` (useCloudSessionCatalog.ts:15), so logging
    // out of a cloud session empties it and the cloud section — plus every row's cloud label — went
    // blank even though the names are sitting in the local cloud cache. Search is cache-based by
    // premise (ADR-0033), so the cache participates here too.
    const cachedCloudNames = useCachedCloudNames();
    const [cacheResults, setCacheResults] = useState<CacheResults>(EMPTY_CACHE_RESULTS);
    const [isSearching, setIsSearching] = useState(false);

    const isQueryTooShort = debounced.length > 0 && debounced.length < MIN_QUERY_LENGTH;

    // The cache search effect deliberately depends only on `debounced` and the (stable, useCallback'd)
    // `search`. Cloud-name matching runs during render instead: both cloud sources hand back a freshly
    // built array on every render (useInvitedClouds filters, useCloudSessionCatalog falls back to `[]`),
    // so feeding them into the effect's dependency list re-ran it on every render — each run set state,
    // which re-rendered, which re-ran it: an endless loop that made results flicker and re-search.
    useEffect(() => {
        if (debounced.length < MIN_QUERY_LENGTH) {
            setCacheResults(EMPTY_CACHE_RESULTS);
            setIsSearching(false);
            return;
        }

        let cancelled = false;
        setIsSearching(true);

        search(debounced, { cid: activeCid })
            .then(result => {
                if (cancelled) return;
                setCacheResults({
                    places: result.sites.slice(0, MAX_RESULTS_PER_SECTION),
                    channels: result.channels.slice(0, MAX_RESULTS_PER_SECTION),
                    messages: result.chats.slice(0, MAX_MESSAGE_RESULTS),
                });
            })
            .catch(error => {
                if (cancelled) return;
                // Native bridge rejects on a SQLite error or an unhandled/timed-out request (e.g. a
                // very old app build without this handler) — log it and still show cloud-name
                // matches (derived during render, unaffected by the failed call) rather than going blank.
                logger.error('SEARCH', `Global cache search failed for: ${debounced}`, { error });
                setCacheResults(EMPTY_CACHE_RESULTS);
            })
            .finally(() => {
                if (!cancelled) setIsSearching(false);
            });

        return () => {
            cancelled = true;
        };
    }, [debounced, search, activeCid]);

    // Cloud names for the cloud section. The cached name wins over the catalog's, matching how home
    // resolves it (useCachedCloudNames) — and it is the only source that survives a lost cloud
    // session, since the catalog is a REST read gated on `isAuthenticated`
    // (useCloudSessionCatalog.ts:15).
    const cloudNamesByCid = useMemo(() => {
        const names = new Map<string, string | undefined>();
        [...ownedClouds, ...invitedClouds].forEach(cloud => {
            if (cloud.id) names.set(cloud.id, cloud.name);
        });
        Object.entries(cachedCloudNames).forEach(([id, name]) => names.set(id, name));
        return names;
    }, [ownedClouds, invitedClouds, cachedCloudNames]);

    const matchedClouds = useMemo<CloudSearchResult[]>(() => {
        if (debounced.length < MIN_QUERY_LENGTH) return EMPTY_RESULTS.clouds;

        const keyword = debounced.toLowerCase();
        return [...cloudNamesByCid]
            .filter(([, name]) => (name ?? '').toLowerCase().includes(keyword))
            .slice(0, MAX_RESULTS_PER_SECTION)
            .map(([id, name]) => ({ id, name }));
    }, [debounced, cloudNamesByCid]);

    const results = useMemo<GlobalSearchResults>(
        () => ({ clouds: matchedClouds, ...cacheResults }),
        [matchedClouds, cacheResults]
    );

    const hasResults =
        results.clouds.length > 0 ||
        results.places.length > 0 ||
        results.channels.length > 0 ||
        results.messages.length > 0;

    return {
        results,
        isSearching,
        hasResults,
        isQueryTooShort,
        /** Names the scope in the UI copy; undefined on relay or before the name is known. */
        activeCloudName: cloudNamesByCid.get(activeCid),
    };
};
