import { useEffect, useState } from 'react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/web-core';

/**
 * My profile (nick/thumbnail) for the ACTIVE site, sourced from ProfileRepositoryV2.
 *
 * Observes the per-site profile cache keyed by `${sid}@${uid}` and triggers a one-shot
 * `getMyProfile()` fetch so the latest server value lands in the cache. Returns null when no site
 * is active or the user is unidentified (e.g. default cloud / guest), so callers can fall back to
 * session-derived display values.
 *
 * Shared by the home header and the cloud profile edit screen so both read the same source — a
 * `setMyProfile` save reflects immediately because the optimistic cache write fans out to observers.
 */
export const useMyProfile = (): { profile: DomainProfile | null } => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();
    const { selectedSiteId: sid } = useSessionSelection();
    const { userId: uid } = useSessionIdentity();

    const profileId = sid && uid ? `${sid}@${uid}` : null;
    const [profile, setProfile] = useState<DomainProfile | null>(null);

    useEffect(() => {
        if (!profileId) {
            setProfile(null);
            return;
        }
        // Subscribe first so the fetch's cache write (and later optimistic saves) fan in.
        const unsubscribe = profileRepository.observeItem(profileId, setProfile);
        // Only refresh once the socket can carry it. Firing on mount raced the
        // handshake and rejected with `503 SOCKET NOT CONNECTED` on every cold
        // start — swallowed here, but it still reached the log buffer and the
        // reports built from it. The cached value renders meanwhile, and the
        // effect re-runs when `isVerified` flips.
        if (isVerified) void profileRepository.getMyProfile().catch(() => undefined);
        return unsubscribe;
    }, [profileRepository, profileId, isVerified]);

    return { profile };
};
