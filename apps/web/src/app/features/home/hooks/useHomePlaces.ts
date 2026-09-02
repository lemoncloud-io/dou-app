import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/app-runtime';
import type { DomainPlace } from '@chatic/data';

export interface HomePlacesResult {
    places: DomainPlace[];
    isLoading: boolean;
}

/**
 * Observes the place (site) list for the active cloud. List discovery (fetch) is owned globally
 * by useBackgroundSync, and per-place realtime sync is registered by the rendered PlaceItem — which means RELAY has no place sync target at all, since relay does not render the Place section (ADR-0034); only place metadata rides on that plan, so the relay channel list is unaffected
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
 *
 * SCOPE PINNING — the observer's scope key must be derived from THESE {cid, uid} values, not the
 * live DataContextProvider (`ActiveScope`). `ActiveScope` derives its `intent` straight from
 * `session/store` on every read (ADR-0070 결정 7) rather than being pushed by an ancestor effect, so
 * the commit-lag this override originally guarded against — `RuntimeDataBinder` used to push
 * `binding.context` into the provider in an effect that ran AFTER this descendant hook had already
 * subscribed — can no longer happen through that path: that binder has been deleted, so there is no
 * mount point left to reintroduce the push. The explicit contextOverride stays because
 * `ActiveScope.getContext()` also folds in the socket's bound cid as `socketCid`, which this hook does
 * not want mixed into its scope key — passing {cid, uid} keeps the observer keyed purely on the
 * session-selected cloud. See PlaceLocalDataSourceV2 reemit-routing tests.
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

    // Re-subscribe on cloud/uid change and discard the prior cloud's rows. The explicit {cid, uid}
    // override pins the observer scope to the target cloud, independent of the provider's commit lag.
    useEffect(() => {
        setPlaces([]);
        setIsLoading(true);
        return place.observeList(
            undefined,
            result => {
                setPlaces(result?.list ?? []);
                setIsLoading(false);
            },
            { cid, uid }
        );
    }, [place, cid, uid]);

    return { places, isLoading };
};
