import { useEffect, useMemo, useState } from 'react';

import { runtime } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

import { readSelectedCloudId, useSelectedCloudId } from '../../../hooks/useCloudScope';
import { getSocketErrorCode } from '../../../utils/errors';

/**
 * Per-member profile poll cadence (ms) for a chat room.
 *
 * One sync target per ACTIVE member, so the request rate is `members / interval` for as long as the
 * room is open — the inherited 5s meant a 20-person room sustained four profile polls a second for
 * data that changes when somebody edits their nick or photo. 20s keeps a mid-conversation rename
 * visibly quick while cutting that rate fourfold; first paint does not depend on it at all (the
 * one-shot bootstrap below covers members the cache does not hold). List surfaces sit on a resident
 * screen and go slower still — see LIST_PROFILE_SYNC_INTERVAL_MS.
 */
const PROFILE_SYNC_INTERVAL_MS = 20_000;

/**
 * Site-scoped member profiles (nick/avatar) for a channel. Observes the profile cache by `sid`
 * and registers a profile sync target for each active member (`activeMemberIds`, i.e. join rows
 * with `joined !== 0`) that has a profile in this place. Members whose profile is not in the local
 * cache yet are first bootstrapped with a one-shot `refreshItem`, so a never-seen member (or a cold
 * cache) populates immediately instead of waiting for a site-wide delta sync — and a member that
 * read answers 404 for gets no poll at all.
 *
 * The cloud is the selected one — the same cloud the observation reads, since the app graph scopes it
 * to the selection. Targets are registered for it by name and wait for its own slot, and the effect
 * re-runs on the uid the account has there (a target tagged with an old uid never runs again).
 *
 * Returns a `userId -> DomainProfile` map so callers can resolve a member's nick/thumbnail.
 */
export const useChannelProfiles = (
    sid: string | null,
    activeMemberIds: string[],
    syncIntervalMs: number = PROFILE_SYNC_INTERVAL_MS
) => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const cid = useSelectedCloudId();
    const isVerified = runtime.connection.useCloudVerified(cid);
    // An account change retires targets registered under the previous uid in this cloud
    // (SyncManager tags them by it), so re-register on it — see the note in `useSyncTarget`.
    const uid = runtime.session.useUidInCloud(cid);

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
        return profileRepository.observeList({ sid }, result => {
            setProfiles(result?.list ?? []);
        });
    }, [profileRepository, sid]);

    // Register a profile sync target per active member, except one the server has just said has no
    // profile in this place. Network-bound, so gated on isVerified (auto-retries on the false→true
    // edge after re-auth/reconnect).
    //
    // A member the cache holds is registered straight away. One it does not hold is bootstrapped
    // first, and registered only if that read did not come back 404. A profile exists per place and
    // only once its owner has opened that place (`profile.get-mine` creates it), so a member who
    // never has — a cloud 1:1's peer from another place, say — answers 404 for as long as the room
    // is open. A poll for them only re-reads that absence until the scheduler gives up
    // after two 404s and reports the give-up as local rows dropped. They are named through the
    // user-record fallback instead. A profile they create later arrives through the site-wide
    // `profile.syncProfiles` delta when this is the active place, and on the next mount otherwise.
    //
    // Registration is async, so `disposed` is checked before every one: a cleanup that runs first
    // leaves nothing behind for it to have missed.
    useEffect(() => {
        if (!sid || !isVerified || activeMemberIds.length === 0) return;

        const sync = runtime.sync.getSyncManager();
        const disposers: Array<() => void> = [];
        let disposed = false;
        const register = (userId: string) => {
            if (disposed) return;
            disposers.push(sync.registerProfile(`${sid}@${userId}`, syncIntervalMs, { cid }));
        };

        void (async () => {
            let cachedUserIds: Set<string | undefined>;
            try {
                const cached = await profileRepository.cacheReadList({ sid });
                cachedUserIds = new Set(
                    (cached?.list ?? []).map(profile => profile.userId ?? profile.uid).filter(Boolean)
                );
            } catch {
                // Without a reading, nobody can be told apart: register everyone and let the poll sort it.
                activeMemberIds.forEach(register);
                return;
            }

            const uncached = activeMemberIds.filter(userId => !cachedUserIds.has(userId));

            activeMemberIds.filter(userId => cachedUserIds.has(userId)).forEach(register);

            // The app graph fetches through whichever cloud is selected when the call starts. If
            // the selection moved during the read, a refresh would ask the next cloud for this
            // cloud's members — so register them unread, and the re-run for that cloud does its
            // own bootstrap anyway.
            if (disposed || readSelectedCloudId() !== cid) {
                uncached.forEach(register);
                return;
            }
            await Promise.all(
                uncached.map(userId =>
                    profileRepository.refreshItem(`${sid}@${userId}`).then(
                        () => register(userId),
                        error => {
                            // Only the server saying "not here" withholds the poll. Anything else
                            // is the bootstrap failing — a timeout, no socket, or a 403, which a
                            // re-auth of the same socket answers for a moment — and the poll is
                            // what recovers from that.
                            if (getSocketErrorCode(error) !== 404) register(userId);
                        }
                    )
                )
            );
        })();

        return () => {
            disposed = true;
            disposers.forEach(dispose => dispose());
        };
        // memberKey captures the membership set; activeMemberIds is read once per key.
    }, [profileRepository, sid, cid, isVerified, memberKey, syncIntervalMs, uid]);

    const profileMap = useMemo(() => {
        const map = new Map<string, DomainProfile>();
        for (const profile of profiles) {
            const key = profile.userId ?? profile.uid;
            if (key) map.set(key, profile);
        }
        return map;
    }, [profiles]);

    /**
     * Presence only. A member missing from `profileMap` means this device does not hold their row
     * yet — a cold cache, a fetch in flight or one that failed — not that they have no profile.
     * This hook used to return a `hasSnapshot` flag for that, but it turned true on the local
     * cache's first emission, before the server had been asked, so it could not tell the two apart.
     * Whether I have no profile is the server's answer: `usePlaceProfileAbsent`.
     */
    return { profileMap };
};
