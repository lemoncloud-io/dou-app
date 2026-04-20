import { useCallback, useEffect, useState } from 'react';

import { cloudCore, useDynamicProfile } from '@chatic/web-core';
import { usePlaces, useChannels } from '@chatic/data';

import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';
import { IndexedDBStorageAdapter } from '../../chats/storages/IndexedDBStorageAdapter';

import type { MySiteView } from '@lemoncloud/chatic-backend-api';
import type { ChannelView } from '@lemoncloud/chatic-socials-api';

export interface ChatSearchResult {
    channel: ChannelView;
    matchCount: number;
}

export interface SearchResults {
    places: MySiteView[];
    chats: ChatSearchResult[];
}

const DEBOUNCE_MS = 300;

export const useSearch = (query: string) => {
    const profile = useDynamicProfile();
    const userId = profile?.uid ?? '';

    const { places: apiPlaces } = usePlaces();
    const searchPlaceId = cloudCore.getSelectedPlaceId() || '';
    const { channels: apiChannels } = useChannels({ placeId: searchPlaceId, detail: true });

    const [results, setResults] = useState<SearchResults>({ places: [], chats: [] });
    const [isSearching, setIsSearching] = useState(false);

    const performSearch = useCallback(
        async (searchQuery: string) => {
            if (!userId || !searchQuery.trim()) {
                setResults({ places: [], chats: [] });
                setIsSearching(false);
                return;
            }

            setIsSearching(true);

            try {
                const lowerQuery = searchQuery.toLowerCase();

                // Filter places by name (case-insensitive)
                const filteredPlaces = apiPlaces.filter(p => p.name?.toLowerCase().includes(lowerQuery));

                // Load IndexedDB channels and merge with memory channels
                const indexedDbChannels = await IndexedDBChannelAdapter.loadAll(userId);

                // Merge channels: memory (apiChannels) takes priority, then IndexedDB
                const memoryChannelIds = new Set(apiChannels.map(c => c.id));
                const mergedChannels = [...apiChannels, ...indexedDbChannels.filter(c => !memoryChannelIds.has(c.id))];

                // Filter channels by name (case-insensitive)
                const matchedChannels = mergedChannels.filter(ch => ch.name?.toLowerCase().includes(lowerQuery));

                // Search messages across all merged channels (parallel loading)
                const validChannels = mergedChannels.filter((ch): ch is ChannelView & { id: string } => !!ch.id);
                const allMessages = await Promise.all(
                    validChannels.map(ch => IndexedDBStorageAdapter.load(userId, ch.id))
                );

                // Build chat results from message matches
                const chatResults: ChatSearchResult[] = [];
                validChannels.forEach((channel, index) => {
                    const messages = allMessages[index];
                    const matchCount = messages.filter(m => m.content?.toLowerCase().includes(lowerQuery)).length;

                    if (matchCount > 0) {
                        chatResults.push({ channel, matchCount });
                    }
                });

                // Add channels that matched by name but not by messages
                for (const channel of matchedChannels) {
                    const existsInChats = chatResults.some(cr => cr.channel.id === channel.id);
                    if (!existsInChats) {
                        chatResults.push({ channel, matchCount: 0 });
                    }
                }

                // Sort chat results by match count (descending)
                chatResults.sort((a, b) => b.matchCount - a.matchCount);

                setResults({
                    places: filteredPlaces,
                    chats: chatResults,
                });
            } catch (error) {
                console.error('Search error:', error);
                setResults({ places: [], chats: [] });
            } finally {
                setIsSearching(false);
            }
        },
        [userId, apiPlaces, apiChannels]
    );

    useEffect(() => {
        if (!query.trim()) {
            setResults({ places: [], chats: [] });
            setIsSearching(false);
            return;
        }

        setIsSearching(true);
        const timer = setTimeout(() => {
            performSearch(query);
        }, DEBOUNCE_MS);

        return () => clearTimeout(timer);
    }, [query, performSearch]);

    const hasResults = results.places.length > 0 || results.chats.length > 0;

    return {
        results,
        isSearching,
        hasResults,
    };
};
