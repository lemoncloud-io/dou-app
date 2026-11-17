import { useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';

import { usePlaces } from './usePlaces';
import { toProfileMap } from '../stores/useSiteProfilesStore';
import { usePlaceProfilesStore } from '../stores/usePlaceProfilesStore';

/**
 * Mirrors the engine `profile` cache of every place of the active cloud into usePlaceProfilesStore.
 * One observer per place: the cache keeps a row per place for the same uid, and only a query that
 * names the place keeps one place's nick from standing in for another's.
 */
export const usePlaceProfiles = (): void => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { places } = usePlaces();
    // Join the place ids into a stable dependency so the effect re-runs only when the set changes.
    const placeIds = places.map(place => place.id).join(',');

    useEffect(() => {
        const ids = placeIds ? placeIds.split(',') : [];
        const { setPlace, dropPlaces } = usePlaceProfilesStore.getState();
        dropPlaces(new Set(ids));
        // Unsubscribing does not cancel a read already in flight; a late answer from the cloud left
        // behind must not write its places back after the switch dropped them.
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
