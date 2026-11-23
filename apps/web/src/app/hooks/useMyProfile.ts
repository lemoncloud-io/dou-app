import { useEffect, useState } from 'react';

import { runtime, type DomainProfile } from '@chatic/runtime';

const inFlightByProfileId = new Map<string, Promise<unknown>>();

export const useMyProfile = (): { profile: DomainProfile | null } => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { isVerified } = runtime.connection.useRuntimeSocketState();
    const { selectedSiteId: sid } = runtime.session.useSessionSelection();
    const { userId: uid } = runtime.session.useSessionIdentity();

    const profileId = sid && uid ? `${sid}@${uid}` : null;
    const [profile, setProfile] = useState<DomainProfile | null>(null);

    useEffect(() => {
        if (!profileId) {
            setProfile(null);
            return;
        }
        const unsubscribe = profileRepository.observeItem(profileId, setProfile);
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
