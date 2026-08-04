import { useEffect, useMemo, useState } from 'react';

import { useGlobalCacheSearch } from '@chatic/app-runtime';
import { useCloudSessionCatalog } from '@chatic/web-core';
import { logger } from '@chatic/bridges';
import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/app-messages';

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

/**
 * Debounced cross-cloud search: cloud names come from the local catalog/invited-cloud caches
 * (never scanned via the cache search source — see ADR-0033), places/channels/messages come
 * from `useGlobalCacheSearch` (IndexedDB range scan on web, native bridge on WebView).
 */
export const useGlobalSearch = (query: string) => {
    const trimmed = query.trim();
    const debounced = useDebounce(trimmed, DEBOUNCE_MS);
    const { search } = useGlobalCacheSearch();
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const [results, setResults] = useState<GlobalSearchResults>(EMPTY_RESULTS);
    const [isSearching, setIsSearching] = useState(false);

    const allClouds = useMemo<CloudSearchResult[]>(
        () =>
            [...ownedClouds, ...invitedClouds]
                .filter((cloud): cloud is typeof cloud & { id: string } => !!cloud.id)
                .map(cloud => ({ id: cloud.id, name: cloud.name })),
        [ownedClouds, invitedClouds]
    );
    const isQueryTooShort = debounced.length > 0 && debounced.length < MIN_QUERY_LENGTH;

    useEffect(() => {
        if (debounced.length < MIN_QUERY_LENGTH) {
            setResults(EMPTY_RESULTS);
            setIsSearching(false);
            return;
        }

        let cancelled = false;
        setIsSearching(true);

        const keyword = debounced.toLowerCase();
        const matchedClouds = allClouds.filter(cloud => (cloud.name ?? '').toLowerCase().includes(keyword));

        search(debounced)
            .then(result => {
                if (cancelled) return;
                setResults({
                    clouds: matchedClouds.slice(0, MAX_RESULTS_PER_SECTION),
                    places: result.sites.slice(0, MAX_RESULTS_PER_SECTION),
                    channels: result.channels.slice(0, MAX_RESULTS_PER_SECTION),
                    messages: result.chats.slice(0, MAX_MESSAGE_RESULTS),
                });
            })
            .catch(error => {
                if (cancelled) return;
                // Native bridge rejects on a SQLite error or an unhandled/timed-out request (e.g. a
                // very old app build without this handler) — log it and still show cloud-name
                // matches (computed locally, unaffected by the failed call) rather than going blank.
                logger.error('SEARCH', `Global cache search failed for: ${debounced}`, { error });
                setResults({
                    clouds: matchedClouds.slice(0, MAX_RESULTS_PER_SECTION),
                    places: [],
                    channels: [],
                    messages: [],
                });
            })
            .finally(() => {
                if (!cancelled) setIsSearching(false);
            });

        return () => {
            cancelled = true;
        };
    }, [debounced, allClouds, search]);

    const hasResults =
        results.clouds.length > 0 ||
        results.places.length > 0 ||
        results.channels.length > 0 ||
        results.messages.length > 0;

    return { results, isSearching, hasResults, isQueryTooShort };
};
