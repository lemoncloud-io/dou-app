import { useCallback } from 'react';

import { logger } from '@chatic/app-messages';
import { fetchProfile } from '../api';
import { useWebCoreStore } from '../stores';

export const useProfile = () => {
    const { setProfile } = useWebCoreStore();

    const loadProfile = useCallback(async () => {
        try {
            const profile = await fetchProfile();
            setProfile(profile);
            return profile;
        } catch (error) {
            logger.error('PROFILE', 'Profile fetch failed', { error });
            throw error;
        }
    }, [setProfile]);

    return { loadProfile };
};
