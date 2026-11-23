import { useEffect, useMemo, useState } from 'react';

import type { DomainPlace } from '@chatic/runtime';
import { runtime } from '@chatic/runtime';

export const usePlaces = () => {
    const { place: placeRepository } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    const uid = session.identity.userId;
    const [places, setPlaces] = useState<DomainPlace[]>([]);
    const [isLoading, setIsLoading] = useState(true);

    useEffect(() => {
        setPlaces([]);
        setIsLoading(true);
        let cancelled = false;
        const unsubscribe = placeRepository.observeList(undefined, result => {
            if (cancelled) return;
            setPlaces(result?.list ?? []);
            setIsLoading(false);
        });
        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [placeRepository, cid, uid]);

    const cloudPlaces = useMemo(() => places.filter(row => row.cid === cid), [places, cid]);
    const placeIdsKey = cloudPlaces
        .map(place => place.id ?? '')
        .filter(Boolean)
        .join('\u0000');
    const placeIds = useMemo(() => (placeIdsKey ? placeIdsKey.split('\u0000') : []), [placeIdsKey]);

    return { places: cloudPlaces, placeIds, isLoading };
};
