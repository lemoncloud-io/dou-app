import { useEffect, useState } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { runtime } from '@chatic/app-runtime';

import { messagePlainText } from '../../../shared';

export interface ChannelSearchResult {
    channel: DomainChannel;
    /** Newest matches first, capped at {@link MAX_MATCHES_PER_CHANNEL}. */
    matches: DomainChat[];
    /** Total cached matches in this channel (may exceed matches.length). */
    matchCount: number;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
/** Cached page scanned per channel — bounds work on big channels. */
const PER_CHANNEL_LIMIT = 200;
const MAX_MATCHES_PER_CHANNEL = 3;
export const SEARCH_MAX_CHANNELS = 30;

/**
 * A row a search may return. Reaction events are chats too, and a deleted
 * message keeps its text in the cache while the feed shows a tombstone, so
 * neither may surface as a hit. Thread replies stay: the dialog opens their
 * thread rather than scrolling the main feed, which never renders them.
 */
const isSearchable = (q: string) => (chat: DomainChat) =>
    chat.subType !== 'reaction' && !chat.hidden && messagePlainText(chat.content).toLowerCase().includes(q);

/**
 * Local message search over the engine's chat cache (no search endpoint exists
 * server-side — same approach as apps/web). Each channel's most recent cached
 * page is read with `cacheReadList` (local only), so typing never fans out
 * network feeds. Results are best-effort: bounded by what's already cached.
 */
export const useMessageSearch = (query: string, channels: DomainChannel[]) => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [results, setResults] = useState<ChannelSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    // Cached rows the last search read, matching or not. Zero means the device has nothing loaded
    // for these channels yet (a cold start), which is a different empty result from "no match".
    const [scannedCount, setScannedCount] = useState<number | null>(null);

    useEffect(() => {
        const q = query.trim().toLowerCase();
        if (q.length < MIN_QUERY_LENGTH) {
            setResults([]);
            setScannedCount(null);
            setIsSearching(false);
            return;
        }
        let active = true;
        setIsSearching(true);
        const timer = setTimeout(() => {
            void Promise.all(
                channels.slice(0, SEARCH_MAX_CHANNELS).map(async channel => {
                    if (!channel.id) return { scanned: 0, result: null };
                    const page = await chatRepository
                        .cacheReadList({ channelId: channel.id, limit: PER_CHANNEL_LIMIT })
                        .catch(() => null);
                    const rows = page?.list ?? [];
                    const all = rows.filter(isSearchable(q));
                    if (all.length === 0) return { scanned: rows.length, result: null };
                    const matches = [...all]
                        .sort((a, b) => (b.chatNo ?? 0) - (a.chatNo ?? 0))
                        .slice(0, MAX_MATCHES_PER_CHANNEL);
                    return { scanned: rows.length, result: { channel, matches, matchCount: all.length } };
                })
            ).then(found => {
                if (!active) return;
                setResults(
                    found
                        .map(entry => entry.result)
                        .filter((r): r is ChannelSearchResult => r !== null)
                        .sort((a, b) => b.matchCount - a.matchCount)
                );
                setScannedCount(found.reduce((sum, entry) => sum + entry.scanned, 0));
                setIsSearching(false);
            });
        }, DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [query, channels, chatRepository]);

    // The search silently covered only the first SEARCH_MAX_CHANNELS channels, and
    // the empty state never said so. Callers state the scope when it binds.
    const isTruncated = channels.length > SEARCH_MAX_CHANNELS;

    return { results, isSearching, isTruncated, scannedCount };
};
