import { useEffect, useMemo, useState } from 'react';

import { getSyncManager, useRuntimeRepositories, useRuntimeSocketState } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

// Per-member profile poll cadence (ms). Matches testbed CreateChannelPage's profile sync interval.
// Tuned for a chat room, where a member's nick/avatar changing mid-conversation should show up fast.
const PROFILE_SYNC_INTERVAL_MS = 5000;

/**
 * Site-scoped member profiles (nick/avatar) for a channel. Observes the profile cache by `sid`
 * and registers a profile sync target for EVERY active member (`activeMemberIds`, i.e. join rows
 * with `joined !== 0`). Members whose profile is not in the local cache yet are additionally
 * bootstrapped with a one-shot `refreshItem` so a never-seen member (or a cold cache) populates
 * immediately instead of waiting for the first poll tick or a site-wide delta sync.
 *
 * Returns a `userId -> DomainProfile` map so callers can resolve a member's nick/thumbnail.
 */
export const useChannelProfiles = (
    sid: string | null,
    activeMemberIds: string[],
    syncIntervalMs: number = PROFILE_SYNC_INTERVAL_MS
) => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const { isVerified } = useRuntimeSocketState();

    const [profiles, setProfiles] = useState<DomainProfile[]>([]);
    // Whether this hook has produced a reading yet — see `hasSnapshot` in the return.
    const [hasSnapshot, setHasSnapshot] = useState(false);

    // Join into a stable dependency so the registration effect only re-runs on a real membership
    // change, not on every render's new array identity.
    const memberKey = activeMemberIds.join(',');

    // Observe the site profile cache; re-subscribe when the site changes.
    useEffect(() => {
        if (!sid) {
            setProfiles([]);
            setHasSnapshot(false);
            return;
        }
        // A site switch invalidates the previous site's reading; callers must not treat the old
        // answer as this site's.
        setHasSnapshot(false);
        return profileRepository.observeList({ sid }, result => {
            setProfiles(result?.list ?? []);
            setHasSnapshot(true);
        });
    }, [profileRepository, sid]);

    // Register a profile sync target for EVERY active member, synchronously, so an early cleanup
    // can never race an async registration. Network-bound, so gated on isVerified (auto-retries on
    // the false→true edge after re-auth/reconnect). The cache read only drives the bootstrap of
    // members the cache does not hold yet — it never gates registration.
    useEffect(() => {
        if (!sid || !isVerified || activeMemberIds.length === 0) return;

        const sync = getSyncManager();
        const disposers = activeMemberIds.map(userId => sync.registerProfile(`${sid}@${userId}`, syncIntervalMs));

        let disposed = false;
        void (async () => {
            try {
                const cached = await profileRepository.cacheReadList({ sid });
                if (disposed) return;
                const cachedUserIds = new Set(
                    (cached?.list ?? []).map(profile => profile.userId ?? profile.uid).filter(Boolean)
                );
                await Promise.all(
                    activeMemberIds
                        .filter(userId => !cachedUserIds.has(userId))
                        .map(userId => profileRepository.refreshItem(`${sid}@${userId}`))
                );
            } catch {
                // Bootstrap is best-effort: the registered poll picks the member up on the next tick.
            } finally {
                // Settle the reading even if the cache held nothing and `observeList` never emitted,
                // so a caller waiting on `hasSnapshot` cannot wait forever.
                if (!disposed) setHasSnapshot(true);
            }
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
        // memberKey captures the membership set; activeMemberIds is read once per key.
    }, [profileRepository, sid, isVerified, memberKey, syncIntervalMs]);

    const profileMap = useMemo(() => {
        const map = new Map<string, DomainProfile>();
        for (const profile of profiles) {
            const key = profile.userId ?? profile.uid;
            if (key) map.set(key, profile);
        }
        return map;
    }, [profiles]);

    /**
     * `hasSnapshot` distinguishes "no profile" from "not read yet". `profileMap` starts empty, and
     * this hook is downstream of the channel row (it needs `sid`), so an empty map is the normal
     * state for the first renders — a caller that reads absence from it alone will conclude "this
     * member has no profile" about everyone. Only meaningful for absence; presence in `profileMap`
     * is self-evident.
     */
    return { profileMap, hasSnapshot };
};
