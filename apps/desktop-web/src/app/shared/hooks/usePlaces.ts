import { useEffect, useState } from 'react';

import type { DomainSite } from '@chatic/data';
import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';

/**
 * Places (sites) for the active cloud. List discovery (fetch / delta sync) is owned globally by
 * the runtime background sync (`place.refreshList`), so this hook only observes the place cache
 * and exposes the rows. The first place is used as the default `sid` for channel queries.
 *
 * The subscription is re-created whenever the active cloud (cid) changes so the previous cloud's
 * rows are discarded at once rather than lingering until the next sync resolves — otherwise
 * HomePage reads a stale list as "the current cloud's places" and auto-selects a place from the
 * wrong cloud, thrashing the channel list during the switch. `uid` is the rest of the observer's
 * scope key and flips only at token commit, after the optimistic cid — re-key on it too.
 */
export const usePlaces = () => {
    const { place: placeRepository } = useRuntimeRepositories();
    const session = useGlobalSession();
    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const uid = session.identity.userId;
    const [places, setPlaces] = useState<DomainSite[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Re-subscribe on cloud/user change and drop the prior cloud's rows.
    useEffect(() => {
        setPlaces([]);
        setIsLoading(true);
        return placeRepository.observeList(undefined, result => {
            setPlaces(result?.list ?? []);
            setIsLoading(false);
        });
    }, [placeRepository, cid, uid]);

    return { places, isLoading };
};
