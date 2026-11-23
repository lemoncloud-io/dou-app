import { runtime } from '@chatic/runtime';

import { GUEST_MAX_CHANNELS, MAX_CHANNELS_PER_PLACE } from '../utils/consts';

export interface UserPermissions {
    canCreateChannel: boolean;
    canCreatePlace: boolean;
    maxChannels: number;
    useCloudProfile: boolean;
    canSelectCloud: boolean;
}

export const useUserPermissions = (): UserPermissions => {
    const { isGuest, isCloudActive } = runtime.session.useRuntimeProfile();

    const canUseCloud = !isGuest && isCloudActive;

    return {
        canCreateChannel: true,
        canCreatePlace: canUseCloud,
        useCloudProfile: canUseCloud,
        canSelectCloud: true,
        maxChannels: isGuest ? GUEST_MAX_CHANNELS : MAX_CHANNELS_PER_PLACE,
    };
};
