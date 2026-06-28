import { useEffect, useMemo, useState } from 'react';

import { getSyncManager, useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

// Per-member profile poll cadence (ms). Matches testbed CreateChannelPage's profile sync interval.
const PROFILE_SYNC_INTERVAL_MS = 5000;

/**
 * Site-scoped member profiles (nick/avatar) for a channel. Observes the profile cache by `sid`
 * and registers a profile sync target per ACTIVE member that ALSO has a cached profile —
 * mirroring testbed CreateChannelPage. `activeMemberIds` (join `joined !== 0`) scopes the targets;
 * the cached-profile filter is load-bearing: the site profile list is delta-synced upstream by the
 * global background sync, so we never trigger a per-member profile.get for users without a site
 * profile — we only keep polling the ones the cache already holds.
 *
 * Returns a `userId -> DomainProfile` map so callers can resolve a member's nick/thumbnail.
 */
export const useChannelProfiles = (sid: string | null, activeMemberIds: string[]) => {
    const { profile: profileRepository } = useRuntimeRepositories();

    const [profiles, setProfiles] = useState<DomainProfile[]>([]);

    // Join into a stable dependency so the registration effect only re-runs on a real membership
    // change, not on every render's new array identity.
    const memberKey = activeMemberIds.join(',');

    // Observe the site profile cache; re-subscribe when the site changes.
    useEffect(() => {
        if (!sid) {
            setProfiles([]);
            return;
        }
        return profileRepository.observeList({ sid }, result => setProfiles(result?.list ?? []));
    }, [profileRepository, sid]);

    // Register profile sync only for members that already have a cached profile. No isVerified
    // gate: the profile data is owned by ProfileSyncPlan + the global background sync, and this
    // effect re-runs on sid / membership change, so a switch re-registers against the new scope.
    useEffect(() => {
        if (!sid) return;
        let disposed = false;
        let disposers: Array<() => void> = [];

        void (async () => {
            const cached = await profileRepository.cacheReadList({ sid });
            if (disposed) return;
            const cachedUserIds = new Set(
                (cached?.list ?? []).map(profile => profile.userId ?? profile.uid).filter(Boolean)
            );

            const sync = getSyncManager();
            disposers = activeMemberIds
                .filter(userId => cachedUserIds.has(userId))
                .map(userId =>
                    sync.register({ type: 'profile', id: `${sid}@${userId}`, intervalMs: PROFILE_SYNC_INTERVAL_MS })
                );
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
        // memberKey captures the membership set; memberUserIds is read once per key.
    }, [profileRepository, sid, memberKey]);

    const profileMap = useMemo(() => {
        const map = new Map<string, DomainProfile>();
        for (const profile of profiles) {
            const key = profile.userId ?? profile.uid;
            if (key) map.set(key, profile);
        }
        return map;
    }, [profiles]);

    return { profileMap };
};
