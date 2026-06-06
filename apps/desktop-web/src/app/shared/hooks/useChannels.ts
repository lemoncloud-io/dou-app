import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '@chatic/app-runtime';

const CHANNEL_LIMIT = 100;

/** Most-recent-activity first, so the list order is stable across refetches. */
const channelTime = (channel: DomainChannel): number => channel.lastActivityAt || channel.lastChat$?.createdAtMs || 0;

const sortByRecency = (list: DomainChannel[]): DomainChannel[] =>
    [...list].sort((a, b) => channelTime(b) - channelTime(a));

/**
 * Streams the channel list for a place via the engine channel repository
 * (cache-first fetch + create/update/delete subscriptions). Results are sorted
 * by recency, and the list is cleared the instant the place changes so the
 * previous place's channels never flash under the new place header.
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Render-phase reset on place switch (mirrors apps/web useChannels): drop the
    // old list immediately rather than waiting for the next fetch to resolve.
    const [prevPlaceId, setPrevPlaceId] = useState(placeId);
    if (placeId !== prevPlaceId) {
        setPrevPlaceId(placeId);
        setChannels([]);
        setIsLoading(true);
    }

    useEffect(() => {
        if (!placeId || !isVerified) return;

        let active = true;
        setIsLoading(true);

        const fetchChannels = () => {
            channelRepository
                .fetchChannel({ sid: placeId, limit: CHANNEL_LIMIT }, { cachePolicy: 'cache-first' })
                .then(result => {
                    if (!active) return;
                    setChannels(sortByRecency((result.list ?? []) as DomainChannel[]));
                })
                .finally(() => {
                    if (active) setIsLoading(false);
                });
        };

        fetchChannels();

        const unsubs = [
            channelRepository.onChannelCreated(fetchChannels),
            channelRepository.onChannelUpdated(fetchChannels),
            channelRepository.onChannelDeleted(fetchChannels),
        ];

        return () => {
            active = false;
            unsubs.forEach(fn => fn());
        };
    }, [channelRepository, placeId, isVerified]);

    return { channels, isLoading };
};
