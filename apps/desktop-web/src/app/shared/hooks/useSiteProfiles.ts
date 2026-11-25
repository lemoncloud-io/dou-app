import { useEffect } from 'react';

import { runtime } from '@chatic/runtime-react';

import { type PlaceProfileEntry, toProfileMap, useSiteProfilesStore } from '../stores/useSiteProfilesStore';
import { type ResolvedDisplay, resolveDisplay } from '../utils/displayProfile';

export const useSiteProfiles = (): void => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const session = runtime.session.useGlobalSession();
    const selectedPlaceId = session.activeServer.siteId ?? null;
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const setAll = useSiteProfilesStore(s => s.setAll);
    const reset = useSiteProfilesStore(s => s.reset);

    useEffect(() => {
        reset();
        if (!selectedPlaceId) return;
        const unsubscribe = profileRepository.observeList({ sid: selectedPlaceId }, result => {
            setAll(toProfileMap(result?.list));
        });
        return unsubscribe;
    }, [profileRepository, selectedPlaceId, setAll, reset]);

    useEffect(() => {
        if (!selectedPlaceId || !isVerified) return;
        void profileRepository.getMyProfile().catch(() => undefined);
    }, [profileRepository, selectedPlaceId, isVerified]);
};

export const useDisplayProfile = (uid: string, fallbackName: string, fallbackThumbnail?: string): ResolvedDisplay => {
    const place = useSiteProfilesStore(s => s.profiles[uid]);
    return resolveDisplay(place, fallbackName, fallbackThumbnail);
};

export const useSiteProfileMap = (): Record<string, PlaceProfileEntry> => useSiteProfilesStore(s => s.profiles);
