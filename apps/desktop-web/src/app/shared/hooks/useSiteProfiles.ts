import { useEffect } from 'react';

import { useWebSocketV2Store } from '@chatic/socket';
import { useWebCoreStore } from '@chatic/web-core';
import { useRepositories } from '@chatic/app-runtime';

import { useMyCloudUidStore } from '../stores/useMyCloudUidStore';
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
 *
 * Self gotcha: the cache (and every other member) is keyed by the canonical
 * cloud uid, but every display surface looks me up by `profile.uid` (the ACCOUNT
 * id). So my own Place Profile would never resolve. We learn my canonical uid via
 * get-site-profile once (persisted for instant resolution on later loads) and
 * mirror my entry under the account uid, so the existing account-uid lookups just
 * work — cache-first, no per-mount async flash.
 */
export const useSiteProfiles = (): void => {
    const { profile: profileRepository } = useRepositories();
    const selectedPlaceId = useSelectedPlaceStore(s => s.selectedPlaceId);
    const cid = useWebSocketV2Store(s => s.cloudId) ?? 'default';
    const accountUid = useWebCoreStore(s => s.profile?.uid ?? '');
    const setAll = useSiteProfilesStore(s => s.setAll);
    const reset = useSiteProfilesStore(s => s.reset);
    const cloudUid = useMyCloudUidStore(s => (selectedPlaceId ? s.byPlace[`${cid}:${selectedPlaceId}`] : undefined));
    const setMyCloudUid = useMyCloudUidStore(s => s.setUid);

    // Resolve + persist my canonical cloud uid for this place once. Only the self
    // read returns it; persisting means later loads mirror self from cache with no
    // network wait. Fail-soft: a miss just leaves self on the Global fallback.
    useEffect(() => {
        if (!selectedPlaceId || cloudUid) return;
        let cancelled = false;
        void profileRepository
            .getMyProfile()
            .then(view => {
                if (!cancelled && view?.userId) setMyCloudUid(cid, selectedPlaceId, view.userId);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [profileRepository, cid, selectedPlaceId, cloudUid, setMyCloudUid]);

    useEffect(() => {
        reset();
        const unsubscribe = profileRepository.subscribeList(undefined, result => {
            const next: Record<string, PlaceProfileEntry> = {};
            for (const item of result?.list ?? []) {
                if (item.uid) next[item.uid] = { nick: item.nick, thumbnail: item.thumbnail };
            }
            // Mirror my own entry (keyed by canonical cloud uid) under the account
            // uid that every surface looks me up by.
            if (cloudUid && accountUid && next[cloudUid] && !next[accountUid]) {
                next[accountUid] = next[cloudUid];
            }
            setAll(next);
        });
        return unsubscribe;
    }, [profileRepository, selectedPlaceId, cloudUid, accountUid, setAll, reset]);
};

/** Resolved Display Profile for one user — Place override over the given Global fallback. */
export const useDisplayProfile = (uid: string, fallbackName: string, fallbackThumbnail?: string): ResolvedDisplay => {
    const place = useSiteProfilesStore(s => s.profiles[uid]);
    return resolveDisplay(place, fallbackName, fallbackThumbnail);
};

/** The full current-place override map — for callers that resolve many uids (e.g. message rows). */
export const useSiteProfileMap = (): Record<string, PlaceProfileEntry> => useSiteProfilesStore(s => s.profiles);
