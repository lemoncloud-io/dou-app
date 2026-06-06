import { useEffect, useState } from 'react';

import type { DomainChannel } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRepositories } from '@chatic/app-runtime';

const CHANNEL_LIMIT = 100;

/**
 * Tracer-bullet channel list hook. Streams the channel list for a place via the
 * engine's channel repository (cache-first fetch + create/update/delete event
 * subscriptions). A later phase will adopt the richer apps/web useChannels
 * (unread counts, polling, optimistic ordering).
 */
export const useChannels = (placeId: string | undefined) => {
    const { channel: channelRepository } = useRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const [channels, setChannels] = useState<DomainChannel[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        if (!placeId || !isVerified) return;

        let active = true;
        setIsLoading(true);

        const fetchChannels = () => {
            channelRepository
                .fetchChannel({ sid: placeId, limit: CHANNEL_LIMIT }, { cachePolicy: 'cache-first' })
                .then(result => {
                    if (!active) return;
                    setChannels(result.list ?? []);
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
