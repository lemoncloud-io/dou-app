import { useEffect, useState } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';

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
const MAX_CHANNELS = 30;

/**
 * Local message search over the engine's chat cache (no search endpoint exists
 * server-side — same approach as apps/web). Each channel's most recent cached
 * page is read with `cacheReadList` (local only), so typing never fans out
 * network feeds. Results are best-effort: bounded by what's already cached.
 */
export const useMessageSearch = (query: string, channels: DomainChannel[]) => {
    const { chat: chatRepository } = useRuntimeRepositories();
    const [results, setResults] = useState<ChannelSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);

    useEffect(() => {
        const q = query.trim().toLowerCase();
        if (q.length < MIN_QUERY_LENGTH) {
            setResults([]);
            setIsSearching(false);
            return;
        }
        let active = true;
        setIsSearching(true);
        const timer = setTimeout(() => {
            void Promise.all(
                channels.slice(0, MAX_CHANNELS).map(async channel => {
                    if (!channel.id) return null;
                    const page = await chatRepository
                        .cacheReadList({ channelId: channel.id, limit: PER_CHANNEL_LIMIT })
                        .catch(() => null);
                    const all = (page?.list ?? []).filter(c => messagePlainText(c.content).toLowerCase().includes(q));
                    if (all.length === 0) return null;
                    const matches = [...all]
                        .sort((a, b) => (b.chatNo ?? 0) - (a.chatNo ?? 0))
                        .slice(0, MAX_MATCHES_PER_CHANNEL);
                    return { channel, matches, matchCount: all.length };
                })
            ).then(found => {
                if (!active) return;
                setResults(
                    found
                        .filter((r): r is ChannelSearchResult => r !== null)
                        .sort((a, b) => b.matchCount - a.matchCount)
                );
                setIsSearching(false);
            });
        }, DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [query, channels, chatRepository]);

    return { results, isSearching };
};
