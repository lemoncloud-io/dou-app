import { useEffect, useMemo, useState } from 'react';

import { runtime } from '@chatic/runtime';
import { useCloudSessionCatalog } from '../../../hooks/useCloudCatalog';
import { logger } from '@chatic/bridges';
import type { CacheChannelView, CacheChatView, CacheSiteView } from '@chatic/bridge-messages';

import { useCachedCloudNames } from '../../../hooks/useCachedCloudNames';
import { useInvitedClouds } from '../../../hooks/useInvitedClouds';
import { isEventChat } from '../../../utils/chat';

const useDebounce = <T>(value: T, delay: number): T => {
    const [debounced, setDebounced] = useState(value);
    useEffect(() => {
        const timer = setTimeout(() => setDebounced(value), delay);
        return () => clearTimeout(timer);
    }, [value, delay]);
    return debounced;
};

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const MAX_RESULTS_PER_SECTION = 20;
const MAX_MESSAGE_RESULTS = 30;

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

type CacheResults = Pick<GlobalSearchResults, 'places' | 'channels' | 'messages'>;

const EMPTY_CACHE_RESULTS: CacheResults = { places: [], channels: [], messages: [] };

export const useGlobalSearch = (query: string) => {
    const trimmed = query.trim();
    const debounced = useDebounce(trimmed, DEBOUNCE_MS);
    const { search } = runtime.data.useGlobalCacheSearch();
    const { selectedCloudId } = runtime.session.useSessionSelection();
    const activeCid = selectedCloudId ?? 'default';
    const { clouds: ownedClouds } = useCloudSessionCatalog();
    const { invitedClouds } = useInvitedClouds();
    const cachedCloudNames = useCachedCloudNames();
    const [cacheResults, setCacheResults] = useState<CacheResults>(EMPTY_CACHE_RESULTS);
    const [isSearching, setIsSearching] = useState(false);

    const isQueryTooShort = debounced.length > 0 && debounced.length < MIN_QUERY_LENGTH;

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
                    messages: result.chats
                        .filter(chat => !chat.hidden && !isEventChat(chat))
                        .slice(0, MAX_MESSAGE_RESULTS),
                });
            })
            .catch(error => {
                if (cancelled) return;
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
        activeCloudName: cloudNamesByCid.get(activeCid),
    };
};
