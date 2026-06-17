import { useCallback, useState } from 'react';

import type { ProfileBody, ProfileView } from '@lemoncloud/chatic-socials-api';

import { logger } from '@chatic/bridges';
import { useRuntimeRepositories } from '@chatic/app-runtime';

/**
 * My Place Profile (current place) — load the editable setting and save it.
 *
 * Read is lazy (`load`) so we only hit `user.get-site-profile` when the edit
 * surface opens, not on every app render. Save is optimistic in the repository
 * (writes the `profile` cache before the network, rolls back on error), so the
 * caller just awaits and surfaces a toast on failure.
 *
 * Fail-soft (ADR 0007): a load error resolves to `null` so the form seeds from
 * the Global Profile instead of breaking — the feature runs in all modes incl.
 * relay, where these ops are unverified.
 */
export const useMyProfile = () => {
    const { profile: profileRepository } = useRuntimeRepositories();
    const [profile, setProfile] = useState<ProfileView | null>(null);
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
        async (body: ProfileBody): Promise<ProfileView> => {
            setIsSaving(true);
            try {
                const result = await profileRepository.setMyProfile(body);
                setProfile(result);
                return result;
            } finally {
                setIsSaving(false);
            }
        },
        [profileRepository]
    );

    return { profile, isLoading, isSaving, load, save };
};
