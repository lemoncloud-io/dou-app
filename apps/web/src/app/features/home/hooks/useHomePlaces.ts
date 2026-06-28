import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainPlace } from '@chatic/data';

export interface HomePlacesResult {
    places: DomainPlace[];
    isLoading: boolean;
}

/**
 * Observes the place (site) list for the active cloud. List discovery (fetch) is owned globally
 * by useBackgroundSync, and per-place realtime sync is registered by the rendered PlaceItem
 * (usePlaceSync), so this hook only subscribes to the cache.
 *
 * The subscription is re-created whenever the active cloud (cid) changes so the prior cloud's
 * rows are discarded immediately rather than flashing during a switch.
 */
export const useHomePlaces = (): HomePlacesResult => {
    const { place } = useRuntimeRepositories();
    const session = useGlobalSession();
    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';

    const [places, setPlaces] = useState<DomainPlace[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Re-subscribe on cloud change and discard the prior cloud's rows.
    useEffect(() => {
        setPlaces([]);
        setIsLoading(true);
        return place.observeList(undefined, result => {
            setPlaces(result?.list ?? []);
            setIsLoading(false);
        });
    }, [place, cid]);

    return { places, isLoading };
};
