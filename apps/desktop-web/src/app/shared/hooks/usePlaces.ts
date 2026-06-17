import { useEffect, useState } from 'react';

import type { DomainSite } from '@chatic/data';
import { useWebSocketV2Store } from '@chatic/socket';

import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * Tracer-bullet places hook. Loads the Site (place) list via the engine's
 * site repository and exposes them. The first place is used as the default
 * `sid` for channel queries.
 */
export const usePlaces = () => {
    const { site: siteRepository } = useRuntimeRepositories();
    const isVerified = useWebSocketV2Store(s => s.isVerified);
    const cloudId = useWebSocketV2Store(s => s.cloudId);
    const [places, setPlaces] = useState<DomainSite[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Render-phase reset on cloud switch (mirrors useChannels): drop the previous
    // cloud's places at once. Otherwise the stale list lingers until the refetch
    // resolves, and HomePage reads it as "the current cloud's places" — auto-selecting
    // a place from the wrong cloud and thrashing the channel list during the switch.
    const [prevCloudId, setPrevCloudId] = useState(cloudId);
    if (cloudId !== prevCloudId) {
        setPrevCloudId(cloudId);
        setPlaces([]);
        setIsLoading(true);
    }

    useEffect(() => {
        if (!isVerified) return;

        let active = true;
        setIsLoading(true);

        siteRepository
            .fetchSite({}, { cachePolicy: 'cache-first' })
            .then(result => {
                if (!active) return;
                setPlaces(result.list ?? []);
            })
            .finally(() => {
                if (active) setIsLoading(false);
            });

        return () => {
            active = false;
        };
    }, [siteRepository, isVerified, cloudId]);

    return { places, isLoading };
};
