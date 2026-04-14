import { cloudCore } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';
import { useUserContext } from './useUserContext';
import { UserType } from '../types/userContext';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const useDynamicProfile = (): UserProfile$ | null => {
    const profile = useWebCoreStore(s => s.profile);
    const { userType } = useUserContext();

    const cloudToken = cloudCore.getCloudToken();

    const isCloudProfile = userType !== UserType.TEMP_ACCOUNT;
    if (!isCloudProfile || !cloudToken) return profile;

    const { Token, ...cloudProfile } = cloudToken;
    return {
        ...cloudProfile,
        uid: cloudProfile.uid ?? cloudProfile.id,
        $user: (cloudProfile as unknown as UserProfile$).$user ?? profile?.$user,
    } as unknown as UserProfile$;
};
