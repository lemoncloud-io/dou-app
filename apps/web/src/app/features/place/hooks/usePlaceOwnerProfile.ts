import { useEffect, useState } from 'react';

import { useRuntimeRepositories } from '@chatic/app-runtime';
import type { DomainProfile } from '@chatic/data';

/**
 * The place owner's display profile (nick + photo), addressed the way a profile is: the place plus
 * who owns it (`${sid}@${uid}` — ProfileRepositoryV2.makeProfileId).
 *
 * The place row carries `owner$`, but its `name` is an internal identifier (`"LMN:1000051"`), not a
 * person's name — so the owner has to be resolved through the profile domain, which is also the
 * right source: a nick is per-place, and this screen is about one place.
 *
 * Observes the cache and fetches only what is missing, the shape {@link useSenderProfiles} already
 * uses for chat authors, reduced to a single subject. Returns null while nothing is known and stays
 * null when the place has no `ownerId` at all — the relay default place is a `stereo: 'domain'`
 * system site with no owner, so callers must treat null as "no owner row", not "still loading".
 */
export const usePlaceOwnerProfile = (placeId?: string, ownerId?: string): DomainProfile | null => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const [owner, setOwner] = useState<DomainProfile | null>(null);

    const profileId = placeId && ownerId ? `${placeId}@${ownerId}` : null;

    useEffect(() => {
        if (!profileId) {
            setOwner(null);
            return;
        }

        let cancelled = false;
        // Subscribe first so the fetch's cache write fans in through the observer.
        const unsubscribe = profileRepository.observeItem(profileId, next => {
            if (!cancelled) setOwner(next);
        });

        // Read the cache explicitly rather than trusting the observer to have emitted, so a warm
        // cache doesn't refetch what it already holds. A failure costs the row, nothing else.
        void (async () => {
            try {
                const cached = await profileRepository.cacheRead(profileId);
                if (cancelled || cached) return;
                await profileRepository.refreshItem(profileId);
            } catch {
                // Owner left the place, account deleted, offline — the row stays empty.
            }
        })();

        return () => {
            cancelled = true;
            unsubscribe();
        };
    }, [profileRepository, profileId]);

    return owner;
};
