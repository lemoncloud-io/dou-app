import { useEffect } from 'react';

import { useGlobalSession, useSessionIdentity } from '@chatic/web-core';
import { useRuntimeRepositories } from '@chatic/app-runtime';

import { useMyCloudUidStore } from '../stores/useMyCloudUidStore';
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
    const { profile: profileRepository } = useRuntimeRepositories();
    const session = useGlobalSession();
    const cid = session.activeServer.kind === 'cloud' ? session.activeServer.cloudId : 'default';
    // The active place IS the session's selected site (null in the Default Cloud).
    const selectedPlaceId = session.activeServer.siteId ?? null;
    const accountUid = useSessionIdentity().userId ?? '';
    const setAll = useSiteProfilesStore(s => s.setAll);
    const reset = useSiteProfilesStore(s => s.reset);
    // My canonical cloud uid for this cloud — read the place-specific key, falling
    // back to the site-less key written before a site commits (see the effect below).
    const cloudUid = useMyCloudUidStore(s => s.byPlace[`${cid}:${selectedPlaceId ?? ''}`] ?? s.byPlace[`${cid}:`]);
    const setMyCloudUid = useMyCloudUidStore(s => s.setUid);

    // Learn + persist my canonical cloud uid (the id space of a push's `data.uid`) so
    // useCrossCloudPushBadge can attribute cross-cloud pushes to this cloud. Fire it
    // whenever a cloud is active — NOT gated on a selected site. `siteId` is null right
    // after entering a cloud (e.g. via a cross-cloud push deeplink), the exact window a
    // just-arrived push must resolve, and the uid is per-cloud so get-mine returns it
    // regardless of which site. Gating this on `selectedPlaceId` (as before) skipped
    // those clouds and the badge never showed. Keyed by place when known; the badge
    // reverse-map only reads the cid. Fail-soft: a miss leaves self on the Global fallback.
    useEffect(() => {
        if (cid === 'default' || cloudUid) return;
        let cancelled = false;
        void profileRepository
            .getMyProfile()
            .then(view => {
                if (!cancelled && view?.userId) setMyCloudUid(cid, selectedPlaceId ?? '', view.userId);
            })
            .catch(() => undefined);
        return () => {
            cancelled = true;
        };
    }, [profileRepository, cid, selectedPlaceId, cloudUid, setMyCloudUid]);

    useEffect(() => {
        reset();
        const unsubscribe = profileRepository.observeList(undefined, result => {
            const next: Record<string, PlaceProfileEntry> = {};
            for (const item of result?.list ?? []) {
                if (item.uid) next[item.uid] = { nick: item.nick, thumbnail: item.thumbnail };
            }
            // Mirror my own entry (keyed by canonical cloud uid) under the account
            // uid that every surface looks me up by. Mirror always, so edits to the
            // canonical entry are reflected in the accountUid lookup immediately.
            if (cloudUid && accountUid && next[cloudUid]) {
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
