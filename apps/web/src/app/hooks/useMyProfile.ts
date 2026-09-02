import { useEffect, useState } from 'react';

import { useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { useSessionIdentity, useSessionSelection } from '@chatic/app-runtime';

/**
 * In-flight `profile.get-mine` per profile id, shared across every mounted instance of this hook.
 *
 * The observer half of this hook is already shared by the cache layer (same key → one storage read),
 * but the FETCH was not: a surface with two instances mounted — home has them in `HomePage` and in
 * `ChannelList` — sent the same request twice and wrote the same row into the cache twice, and each
 * write re-emits to every observer. The room adds a third instance through `useChannelTitle`.
 *
 * Keyed by profile id (`${sid}@${uid}`) so switching site or account still fetches. Cleared when the
 * request settles, so this dedups concurrent callers only: a later mount (or the next `isVerified`
 * rising edge) still refreshes. That is deliberate — the fetch exists to make the cached row current
 * on entry, and suppressing it for a while would be a freshness policy this hook has no business
 * inventing.
 */
const inFlightByProfileId = new Map<string, Promise<unknown>>();

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
 * Mounting it more than once per screen is safe: the observers share one read and the fetch is
 * deduped (see {@link inFlightByProfileId}).
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
        if (isVerified && !inFlightByProfileId.has(profileId)) {
            const request = profileRepository
                .getMyProfile()
                .catch(() => undefined)
                .finally(() => {
                    inFlightByProfileId.delete(profileId);
                });
            inFlightByProfileId.set(profileId, request);
        }
        return unsubscribe;
    }, [profileRepository, profileId, isVerified]);

    return { profile };
};
