import { useRuntimeProfile } from '@chatic/app-runtime';

/**
 * App-side permission policy. Web-core/app-runtime expose only raw identity facts (userRole /
 * isGuest / isCloudActive); this hook is where the product decides what a user may do, derived from
 * those facts. Kept in the app layer so permission rules can change without touching the runtime.
 */
export interface UserPermissions {
    canCreateChannel: boolean;
    canCreatePlace: boolean;
    maxChannels: number;
    useCloudProfile: boolean;
    canSelectCloud: boolean;
}

const GUEST_MAX_CHANNELS = 3;
const MAX_CHANNELS_PER_PLACE = 100;

export const useUserPermissions = (): UserPermissions => {
    const { isGuest, isCloudActive } = useRuntimeProfile();

    // Place creation and cloud-profile editing require a signed-in (non-guest) user with an active
    // cloud session; channel creation and cloud selection are open to everyone; guests are capped.
    const canUseCloud = !isGuest && isCloudActive;

    return {
        canCreateChannel: true,
        canCreatePlace: canUseCloud,
        useCloudProfile: canUseCloud,
        canSelectCloud: true,
        maxChannels: isGuest ? GUEST_MAX_CHANNELS : MAX_CHANNELS_PER_PLACE,
    };
};
