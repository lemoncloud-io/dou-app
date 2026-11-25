import { useCallback, useState } from 'react';

import type { ProfileBody } from '@lemoncloud/chatic-socials-api';

import { logger } from '@chatic/bridges';
import { runtime } from '@chatic/runtime-react';
import type { DomainProfile } from '@chatic/runtime-react';

export const useMyProfile = () => {
    const { profile: profileRepository } = runtime.data.useRuntimeRepositories();
    const { selectedSiteId } = runtime.session.useSessionSelection();
    const [profile, setProfile] = useState<DomainProfile | null>(null);
    const [isLoading, setIsLoading] = useState(false);
    const [isSaving, setIsSaving] = useState(false);

    const load = useCallback(async () => {
        setIsLoading(true);
        try {
            const result = await profileRepository.getMyProfile();
            setProfile(result);
            return result;
        } catch (error) {
            logger.error('PROFILE', '[useMyProfile] load failed → fall back to Global', { error });
            setProfile(null);
            return null;
        } finally {
            setIsLoading(false);
        }
    }, [profileRepository]);

    const save = useCallback(
        async (body: ProfileBody): Promise<DomainProfile> => {
            setIsSaving(true);
            try {
                const result = await profileRepository.setMyProfile(body, selectedSiteId ?? '');
                setProfile(result);
                return result;
            } finally {
                setIsSaving(false);
            }
        },
        [profileRepository, selectedSiteId]
    );

    return { profile, isLoading, isSaving, load, save };
};
