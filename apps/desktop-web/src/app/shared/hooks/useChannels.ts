import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';

import { useRepositories } from '@chatic/app-runtime';
import { computeChannelUnread } from '../utils';
import { useReadCursorStore } from '../stores';

const CHANNEL_LIMIT = 100;

/** Most-recent-activity first, so the list order is stable across refetches. */
const channelTime = (channel: DomainChannel): number => channel.lastActivityAt || channel.lastChat$?.createdAtMs || 0;

const sortByRecency = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelTime(b) - channelTime(a));

/**
 * Streams the channel list for a place via the engine repositories. Initial load
 * is cache-first; channel/chat/join events trigger a network-only refetch so
 * unread badges stay fresh — a new message from another user fires chat:create
 * (and join:update), not channel:update, so those must be subscribed too or the
 * channel row's unread count never moves. Results are sorted by recency and the
 * list is cleared on place switch so the previous place's channels don't flash.
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository, chat: chatRepository, join: joinRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const myUid = useWebCoreStore(s => s.profile?.uid ?? null);
    const readCursors = useReadCursorStore(s => s.cursors);
    const [rawChannels, setRawChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Render-phase reset on place switch (mirrors apps/web useChannels): drop the
    // old list immediately rather than waiting for the next fetch to resolve.
    const [prevPlaceId, setPrevPlaceId] = useState(placeId);
    if (placeId !== prevPlaceId) {
        setPrevPlaceId(placeId);
        setRawChannels([]);
        setIsLoading(true);
    }

    useEffect(() => {
        if (!placeId || !isVerified) return;

        let active = true;
        setIsLoading(true);

        const fetchChannels = (cachePolicy: 'cache-first' | 'network-only') => {
            channelRepository
                .fetchChannel({ sid: placeId, detail: true, limit: CHANNEL_LIMIT }, { cachePolicy })
                .then(result => {
                    if (!active) return;
                    setRawChannels(sortByRecency((result.list ?? []) as DomainChannel[]));
                })
                .finally(() => {
                    if (active) setIsLoading(false);
                });
        };

        fetchChannels('cache-first');
        const refresh = () => fetchChannels('network-only');

        const unsubs = [
            channelRepository.onChannelCreated(refresh),
            channelRepository.onChannelUpdated(refresh),
            channelRepository.onChannelDeleted(refresh),
            chatRepository.onChatCreated(refresh),
            joinRepository.onJoinUpdated(refresh),
        ];

        return () => {
            active = false;
            unsubs.forEach(fn => fn());
        };
    }, [channelRepository, chatRepository, joinRepository, placeId, isVerified]);

    // Derive unread from the local read cursor too, so reading a channel clears
    // its badge immediately without waiting for a server-cursor refetch.
    const channels = useMemo(
        () => rawChannels.map(c => ({ ...c, unreadCount: computeChannelUnread(c, myUid, readCursors[c.id ?? '']) })),
        [rawChannels, myUid, readCursors]
    );

    return { channels, isLoading };
};
