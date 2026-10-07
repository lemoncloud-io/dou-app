import { useEffect } from 'react';

import { runtime } from '@chatic/app-runtime';

import { type PlaceProfileEntry, useSiteProfilesStore } from '../stores/useSiteProfilesStore';
import { type ResolvedDisplay, resolveDisplay } from '../utils/displayProfile';

/**
 * Single subscription that mirrors the engine `profile` cache (current place)
 * into useSiteProfilesStore. The cache holds a row per place I have been in, so the
 * query names the place: without it a row from another place for the same uid lands
 * in the same map and whichever comes last decides the name shown here. With no place
 * selected there is nothing to mirror and the store stays empty.
 *
 * Mount on each route that renders place-profile data (HomePage, ProfilePage) — routes
 * are mutually exclusive, so there is never a concurrent subscription. Re-subscribes
 * and resets on place switch so the previous place's overrides never leak. Every
 * display surface reads the store via useDisplayProfile rather than subscribing itself.
 *
 * The profile cache keys each entry by the member's `uid`. My own row can sit under my
 * account id (the row my own save writes) or my per-channel cloud id (a synced row), so
 * surfaces that name me look under both — see `viewerPlaceProfile`.
 */
export const useSiteProfiles = (): void => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    // Re-subscribe on place switch so the previous place's overrides never leak.
    const selectedPlaceId = session.activeServer.siteId ?? null;
    const setAll = useSiteProfilesStore(s => s.setAll);
    const reset = useSiteProfilesStore(s => s.reset);

    useEffect(() => {
        reset();
        if (!selectedPlaceId) return;
        const unsubscribe = profileRepository.observeList({ sid: selectedPlaceId }, result => {
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
export const useDisplayProfile = (uid: string, fallbackName: string, fallbackThumbnail?: string): ResolvedDisplay => {
    const place = useSiteProfilesStore(s => s.profiles[uid]);
    return resolveDisplay(place, fallbackName, fallbackThumbnail);
};

/** The full current-place override map — for callers that resolve many uids (e.g. message rows). */
export const useSiteProfileMap = (): Record<string, PlaceProfileEntry> => useSiteProfilesStore(s => s.profiles);
