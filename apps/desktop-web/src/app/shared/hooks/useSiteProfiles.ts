import { useEffect } from 'react';

import { useRepositories } from '@chatic/app-runtime';

import { useSelectedPlaceStore } from '../stores/useSelectedPlaceStore';
import { type PlaceProfileEntry, useSiteProfilesStore } from '../stores/useSiteProfilesStore';
import { type ResolvedDisplay, resolveDisplay } from '../utils/displayProfile';

/**
 * Single subscription that mirrors the engine `profile` cache (current place)
 * into useSiteProfilesStore. Mount on each route that renders place-profile data
 * (HomePage, ProfilePage) — routes are mutually exclusive, so there is never a
 * concurrent subscription. Re-subscribes and resets on place switch so the
 * previous place's overrides never leak. Every display surface reads the store
 * via useDisplayProfile rather than subscribing itself.
 */
export const useSiteProfiles = (): void => {
    const { profile: profileRepository } = useRepositories();
    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const setAll = useSiteProfilesStore(s => s.setAll);
    const reset = useSiteProfilesStore(s => s.reset);

    useEffect(() => {
        reset();
        const unsubscribe = profileRepository.subscribeList(undefined, result => {
            const next: Record<string, PlaceProfileEntry> = {};
            for (const item of result?.list ?? []) {
                if (item.uid) next[item.uid] = { nick: item.nick, thumbnail: item.thumbnail };
            }
            setAll(next);
        });
        return unsubscribe;
    }, [profileRepository, selectedPlaceId, setAll, reset]);
};

/** Resolved Display Profile for one user — Place override over the given Global fallback. */
export const useDisplayProfile = (
    uid: string,
    fallbackName: string,
    fallbackThumbnail?: string
): ResolvedDisplay => {
    const place = useSiteProfilesStore(s => s.profiles[uid]);
    return resolveDisplay(place, fallbackName, fallbackThumbnail);
};

/** The full current-place override map — for callers that resolve many uids (e.g. message rows). */
export const useSiteProfileMap = (): Record<string, PlaceProfileEntry> => useSiteProfilesStore(s => s.profiles);
