import { useCallback } from 'react';

import { logger } from '@chatic/bridges';
import { fetchProfile } from '../api';
import { setSessionProfile } from '../session';

export const useProfile = () => {
    const loadProfile = useCallback(async () => {
        try {
            const profile = await fetchProfile();
            setSessionProfile(profile);
            return profile;
        } catch (error) {
            logger.error('PROFILE', 'Profile fetch failed', { error });
            throw error;
        }
    }, []);

    return { loadProfile };
};
