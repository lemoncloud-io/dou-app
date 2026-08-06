import { useEffect, useMemo, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';
import { logger } from '@chatic/bridges';

/** A message's author, addressed the way a profile is: the place it was written in + who wrote it. */
export interface SenderProfileRef {
    /** The site (place) the message's channel belongs to. */
    sid: string;
    /** The message owner's uid (`chat.ownerId`). */
    userId: string;
}

/** Profile ids are `${sid}@${uid}` (ProfileRepositoryV2.makeProfileId). */
const profileId = (sid: string, userId: string) => `${sid}@${userId}`;

/** The member id a cached row carries — `uid` and `userId` are both the subject on a profile row. */
const memberIdOf = (profile: DomainProfile) => profile.userId || profile.uid;

/**
 * Display profiles (nick + photo) for the authors of chat search results, keyed `${sid}@${uid}`.
 *
 * Goes through `ProfileRepositoryV2`, not the cache-only search source: a profile sync is registered
 * per member only while its room is open (useChannelProfiles), so a search result from a room the
 * user hasn't opened has nothing cached and its author would stay nameless. The repository observes
 * the cache for what is already there and `refreshItem` fetches the rest, writing it back.
 *
 * One subscription per place rather than one per row — the same shape useChannelProfiles and
 * useDmPeers use, so a long result list doesn't fan out into per-row subscriptions.
 *
 * Unlike the room this registers NO sync target: search shows a snapshot, and a poll per author
 * would keep running for people whose rooms aren't even open.
 */
export const useSenderProfiles = (refs: SenderProfileRef[]): Map<string, DomainProfile> => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const [profiles, setProfiles] = useState<Map<string, DomainProfile>>(new Map());

    // Serialized so the effect re-runs on a changed author SET, not on every new array identity —
    // the rows this derives from are rebuilt on every render of the search page.
    const requestKey = useMemo(() => {
        const ids = refs
            .filter(ref => ref.sid && ref.userId)
            .map(ref => profileId(ref.sid, ref.userId))
            .sort();
        return JSON.stringify([...new Set(ids)]);
    }, [refs]);

    useEffect(() => {
        const ids = JSON.parse(requestKey) as string[];
        if (ids.length === 0) {
            setProfiles(new Map());
            return;
        }

        const sids = [...new Set(ids.map(id => id.slice(0, id.lastIndexOf('@'))))];
        let cancelled = false;
        const resolved = new Map<string, DomainProfile>();

        // Live view of what the cache holds for these places.
        const disposers = sids.map(sid =>
            profileRepository.observeList({ sid }, result => {
                (result?.list ?? []).forEach(profile => {
                    const memberId = memberIdOf(profile);
                    if (!profile.sid || !memberId) return;
                    resolved.set(profileId(profile.sid, memberId), profile);
                });
                if (!cancelled) setProfiles(new Map(resolved));
            })
        );

        // Fetch the authors the cache doesn't have. Read the cache explicitly rather than trusting
        // the observer to have emitted yet, so a cold cache doesn't refetch what it already holds.
        void (async () => {
            try {
                const cachedIds = new Set<string>();
                await Promise.all(
                    sids.map(async sid => {
                        const cached = await profileRepository.cacheReadList({ sid });
                        (cached?.list ?? []).forEach(profile => {
                            const memberId = memberIdOf(profile);
                            if (profile.sid && memberId) cachedIds.add(profileId(profile.sid, memberId));
                        });
                    })
                );
                if (cancelled) return;

                const missing = ids.filter(id => !cachedIds.has(id));
                // Best-effort per author: one failure (left the place, deleted account) must not
                // cost the other names. `refreshItem` writes to the cache, so the observer above
                // delivers the result — no need to merge the return value here.
                await Promise.all(missing.map(id => profileRepository.refreshItem(id).catch(() => null)));
            } catch (error) {
                if (!cancelled) logger.warn('SEARCH', 'Failed to load sender profiles', { error });
            }
        })();

        return () => {
            cancelled = true;
            disposers.forEach(dispose => dispose());
        };
    }, [profileRepository, requestKey]);

    return profiles;
};
