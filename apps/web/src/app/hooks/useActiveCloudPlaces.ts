import { useEffect, useMemo, useState } from 'react';

import { runtime, type DomainPlace } from '@chatic/runtime';

import { useColdListWindowElapsed } from './useColdListWindow';

export interface ActiveCloudPlacesResult {
    places: DomainPlace[];
    isLoading: boolean;
}

export const useActiveCloudPlaces = (): ActiveCloudPlacesResult => {
    const { place } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const cid = session.cloud?.cloudId && session.cloud.cloudId !== 'default' ? session.cloud.cloudId : 'default';
    const uid = session.identity.userId ?? undefined;

    const [places, setPlaces] = useState<DomainPlace[]>([]);
    const [hasCacheAnswered, setHasCacheAnswered] = useState(false);
    const hasColdWindowElapsed = useColdListWindowElapsed(`place:${cid}:${uid ?? ''}`);

    useEffect(() => {
        setPlaces([]);
        setHasCacheAnswered(false);
        return place.observeList(
            undefined,
            result => {
                setPlaces(result?.list ?? []);
                setHasCacheAnswered(true);
            },
            { cid, uid }
        );
    }, [place, cid, uid]);

    const cloudPlaces = useMemo(() => places.filter(row => row.cid === cid), [places, cid]);
    const isLoading = !hasCacheAnswered || (cloudPlaces.length === 0 && !hasColdWindowElapsed);

    return { places: cloudPlaces, isLoading };
};
