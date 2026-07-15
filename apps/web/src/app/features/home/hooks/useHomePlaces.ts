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
 * The subscription is re-created whenever the active cloud (cid) OR the derived uid changes so
 * the prior cloud's rows are discarded immediately rather than flashing during a switch.
 *
 * uid is a required part of the cache observer scope key ({cid, sid, uid}), and on a cloud switch
 * it only flips to the new cloud at token commit — AFTER the optimistic cid pre-apply that first
 * re-subscribes this observer. Keying on cid alone leaves the observer registered under the
 * pre-commit uid, so the post-commit list fetch reemits against a different scope key and never
 * reaches it — the rail then stays stale until an unrelated remount. Re-subscribing on uid closes
 * that gap.
 */
export const useHomePlaces = (): HomePlacesResult => {
    const { place } = useRuntimeRepositories();
    const session = useGlobalSession();
    // OPTIMISTIC cloud id (the selected cloud), matching useRuntimeBinding's cache-scope cid — NOT the
    // committed activeServer.cloudId. This re-subscribes the observer the instant a cloud switch
    // pre-applies the cid, so the previous cloud's rows clear immediately instead of lingering until
    // token commit. (uid below still closes the commit-lag gap for the cache scope key.)
    const cid = session.cloud?.cloudId && session.cloud.cloudId !== 'default' ? session.cloud.cloudId : 'default';
    const uid = session.identity.userId ?? undefined;

    const [places, setPlaces] = useState<DomainPlace[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    // Re-subscribe on cloud/uid change and discard the prior cloud's rows.
    useEffect(() => {
        setPlaces([]);
        setIsLoading(true);
        return place.observeList(undefined, result => {
            setPlaces(result?.list ?? []);
            setIsLoading(false);
        });
    }, [place, cid, uid]);

    return { places, isLoading };
};
