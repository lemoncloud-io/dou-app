import { useEffect, useMemo, useState } from 'react';

import type { DomainChannel, DomainChat } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';

import { useRepositories } from '@chatic/app-runtime';
import { computeChannelUnread, mergeChannelsKeepingLatest, withIncomingChat } from '../utils';
import { useReadCursorStore } from '../stores';

const CHANNEL_LIMIT = 100;

// Fixed alphabetical order (Slack-style) so the list doesn't jump on every new
// message; unread is surfaced by the row badge, not by reordering.
const channelLabel = (channel: DomainChannel): string => (channel.name ?? channel.id ?? '').toLowerCase();

const sortByName = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelLabel(a).localeCompare(channelLabel(b)));

/**
 * Streams the channel list for a place via the engine repositories. Initial load
 * is cache-first; channel/chat/join events trigger a network-only refetch so
 * unread badges stay fresh — a new message from another user fires chat:create
 * (and join:update), not channel:update, so those must be subscribed too or the
 * channel row's unread count never moves. Being invited to a brand-new channel
 * fires join:create (a new membership, via the model push) — subscribe it too or
 * the channel never appears until a manual refresh. Results are sorted by recency
 * and the list is cleared on place switch so the previous place's channels don't flash.
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
                    const next = (result.list ?? []) as DomainChannel[];
                    setRawChannels(prev => sortByName(mergeChannelsKeepingLatest(prev, next)));
                })
                .finally(() => {
                    if (active) setIsLoading(false);
                });
        };

        // A new message bumps the channel's last message + unread badge. Apply it
        // locally from the live chat event rather than refetching: the channel
        // endpoint lags, so a refetch here would race the event and reset the badge.
        const applyIncomingChat = (chat: DomainChat) => {
            if (active) setRawChannels(prev => withIncomingChat(prev, chat));
        };

        fetchChannels('cache-first');
        const refresh = () => fetchChannels('network-only');

        const unsubs = [
            channelRepository.onChannelCreated(refresh),
            channelRepository.onChannelUpdated(refresh),
            channelRepository.onChannelDeleted(refresh),
            chatRepository.onChatCreated(applyIncomingChat),
            joinRepository.onJoinCreated(refresh),
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
