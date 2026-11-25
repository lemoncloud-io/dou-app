import { useEffect } from 'react';

import { runtime } from '@chatic/runtime-react';

import { usePlaces } from './usePlaces';
import { toProfileMap } from '../stores/useSiteProfilesStore';
import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';

export const usePlaceProfiles = (): void => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { places } = usePlaces();
    const placeIds = places.map(place => place.id).join(',');

    useEffect(() => {
        const ids = placeIds ? placeIds.split(',') : [];
        const { setPlace, dropPlaces } = usePlaceProfilesStore.getState();
        dropPlaces(new Set(ids));
        let cancelled = false;
        const unsubscribes = ids.map(placeId =>
            profileRepository.observeList({ sid: placeId }, result => {
                if (cancelled) return;
                setPlace(placeId, toProfileMap(result?.list));
            })
        );
        return () => {
            cancelled = true;
            unsubscribes.forEach(unsubscribe => unsubscribe());
        };
    }, [profileRepository, placeIds]);
};
