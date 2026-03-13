import { useCallback, useEffect, useState } from 'react';

import { useDynamicProfile } from '@chatic/web-core';

import { IndexedDBChannelAdapter } from '../../chats/storages/IndexedDBChannelAdapter';
import { IndexedDBStorageAdapter } from '../../chats/storages/IndexedDBStorageAdapter';

import type { ChannelView } from '@lemoncloud/chatic-socials-api';

export interface ChatSearchResult {
    channel: ChannelView;
    matchCount: number;
}

export interface SearchResults {
    places: ChannelView[];
    chats: ChatSearchResult[];
}

const DEBOUNCE_MS = 300;

export const useSearch = (query: string) => {
    const profile = useDynamicProfile();
    const userId = profile?.uid ?? '';

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
                const channels = await IndexedDBChannelAdapter.loadAll(userId);
                const lowerQuery = searchQuery.toLowerCase();

                // Filter channels by name (case-insensitive)
                const matchedChannels = channels.filter(ch => ch.name?.toLowerCase().includes(lowerQuery));

                // Search messages across all channels
                const chatResults: ChatSearchResult[] = [];

                for (const channel of channels) {
                    if (!channel.id) continue;

                    const messages = await IndexedDBStorageAdapter.load(userId, channel.id);
                    const matchedMessages = messages.filter(m => m.content?.toLowerCase().includes(lowerQuery));

                    if (matchedMessages.length > 0) {
                        // Check if this channel is already in places results
                        const isAlreadyInPlaces = matchedChannels.some(ch => ch.id === channel.id);
                        if (!isAlreadyInPlaces) {
                            chatResults.push({
                                channel,
                                matchCount: matchedMessages.length,
                            });
                        } else {
                            // Still add to chats but with match count
                            chatResults.push({
                                channel,
                                matchCount: matchedMessages.length,
                            });
                        }
                    }
                }

                // Add channels that matched by name but not by messages
                for (const channel of matchedChannels) {
                    const existsInChats = chatResults.some(cr => cr.channel.id === channel.id);
                    if (!existsInChats) {
                        chatResults.push({
                            channel,
                            matchCount: 0,
                        });
                    }
                }

                // Sort chat results by match count (descending)
                chatResults.sort((a, b) => b.matchCount - a.matchCount);

                setResults({
                    places: matchedChannels,
                    chats: chatResults,
                });
            } catch (error) {
                console.error('Search error:', error);
                setResults({ places: [], chats: [] });
            } finally {
                setIsSearching(false);
            }
        },
        [userId]
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
