import { useCallback, useEffect, useState } from 'react';

import { useRuntimeRepositories, useSocketState } from '@chatic/app-runtime';
import { useGlobalSession } from '@chatic/web-core';
import type { DomainPlace } from '@chatic/data';

export interface HomePlacesResult {
    places: DomainPlace[];
    isLoading: boolean;
    refresh: () => void;
}

/**
 * Observes the place (site) list for the active cloud. Mirrors the testbed ChatHomePage:
 * the cache subscription is re-created whenever the active cloud (cid) changes, and a
 * verified-gated refresh fetches the latest snapshot so a stale (pre-switch) session is
 * never queried.
 */
export const useHomePlaces = (): HomePlacesResult => {
    const { place } = useRuntimeRepositories();
    const session = useGlobalSession();
    const { isVerified } = useSocketState();
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

    // Fetch the place snapshot once the session is verified (app entry + after each switch).
    useEffect(() => {
        if (!isVerified) return;
        void place.refreshList().catch(() => undefined);
    }, [place, cid, isVerified]);

    const refresh = useCallback(() => {
        void place.refreshList().catch(() => undefined);
    }, [place]);

    return { places, isLoading, refresh };
};
