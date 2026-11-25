import { useEffect, useState } from 'react';

import { runtime, type DomainProfile } from '@chatic/runtime-react';

export const usePlaceOwnerProfile = (placeId?: string, ownerId?: string): DomainProfile | null => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const [owner, setOwner] = useState<DomainProfile | null>(null);

    const profileId = placeId && ownerId ? `${placeId}@${ownerId}` : null;

    useEffect(() => {
        if (!profileId) {
            setOwner(null);
            return;
        }

        let cancelled = false;
        const unsubscribe = profileRepository.observeItem(profileId, next => {
            if (!cancelled) setOwner(next);
        });

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
