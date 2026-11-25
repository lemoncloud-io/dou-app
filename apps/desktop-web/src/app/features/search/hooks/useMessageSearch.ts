import { useEffect, useState } from 'react';

import { isEventChat, type DomainChannel, type DomainChat, runtime } from '@chatic/runtime-react';

import { messagePlainText } from '../../../shared';

export interface ChannelSearchResult {
    channel: DomainChannel;
    matches: DomainChat[];
    matchCount: number;
}

const DEBOUNCE_MS = 300;
const MIN_QUERY_LENGTH = 2;
const PER_CHANNEL_LIMIT = 200;
const MAX_MATCHES_PER_CHANNEL = 3;
export const SEARCH_MAX_CHANNELS = 30;

const isSearchable = (q: string) => (chat: DomainChat) =>
    !isEventChat(chat) && !chat.hidden && messagePlainText(chat.content).toLowerCase().includes(q);

export const useMessageSearch = (query: string, channels: DomainChannel[]) => {
    const { chat: chatRepository } = runtime.data.useRuntimeRepositories();
    const [results, setResults] = useState<ChannelSearchResult[]>([]);
    const [isSearching, setIsSearching] = useState(false);
    const [scannedCount, setScannedCount] = useState<number | null>(null);
    const [failedCount, setFailedCount] = useState(0);

    useEffect(() => {
        const q = query.trim().toLowerCase();
        if (q.length < MIN_QUERY_LENGTH) {
            setResults([]);
            setScannedCount(null);
            setFailedCount(0);
            setIsSearching(false);
            return;
        }
        let active = true;
        setIsSearching(true);
        const timer = setTimeout(() => {
            void Promise.all(
                channels.slice(0, SEARCH_MAX_CHANNELS).map(async channel => {
                    if (!channel.id) return { scanned: 0, result: null, failed: false };
                    let page: { list: DomainChat[] } | null;
                    try {
                        page = await chatRepository.cacheReadList({ channelId: channel.id, limit: PER_CHANNEL_LIMIT });
                    } catch {
                        return { scanned: 0, result: null, failed: true };
                    }
                    const rows = page?.list ?? [];
                    const all = rows.filter(isSearchable(q));
                    if (all.length === 0) return { scanned: rows.length, result: null, failed: false };
                    const matches = [...all]
                        .sort((a, b) => (b.chatNo ?? 0) - (a.chatNo ?? 0))
                        .slice(0, MAX_MATCHES_PER_CHANNEL);
                    return {
                        scanned: rows.length,
                        result: { channel, matches, matchCount: all.length },
                        failed: false,
                    };
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
                setFailedCount(found.filter(entry => entry.failed).length);
                setIsSearching(false);
            });
        }, DEBOUNCE_MS);
        return () => {
            active = false;
            clearTimeout(timer);
        };
    }, [query, channels, chatRepository]);

    const isTruncated = channels.length > SEARCH_MAX_CHANNELS;

    return { results, isSearching, isTruncated, scannedCount, failedCount };
};
