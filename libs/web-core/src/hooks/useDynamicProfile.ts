import { cloudCore } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const useDynamicProfile = (): UserProfile$ | null => {
    const { isGuest, profile } = useWebCoreStore();

    if (isGuest) return profile;

    const cloudToken = cloudCore.getCloudToken();
    if (!cloudToken) return profile;

    const { Token, ...cloudProfile } = cloudToken;
    return {
        ...cloudProfile,
        uid: cloudProfile.uid ?? cloudProfile.id,
        $user: (cloudProfile as unknown as UserProfile$).$user ?? profile?.$user,
    } as unknown as UserProfile$;
};
