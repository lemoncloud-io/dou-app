import { cloudCore } from '../core';
import { useWebCoreStore } from '../stores/useWebCoreStore';

import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

export const useDynamicProfile = (): UserProfile$ | null => {
    const { isGuest, isInvited, profile } = useWebCoreStore();

    const cloudToken = cloudCore.getCloudToken();

    const isCloudProfile = isInvited || !isGuest;
    if (!isCloudProfile || !cloudToken) return profile;

    const { Token, ...cloudProfile } = cloudToken;
    return {
        ...cloudProfile,
        uid: cloudProfile.uid ?? cloudProfile.id,
        $user: (cloudProfile as unknown as UserProfile$).$user ?? profile?.$user,
    } as unknown as UserProfile$;
};
