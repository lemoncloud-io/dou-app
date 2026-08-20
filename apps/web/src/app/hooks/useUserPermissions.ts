import { useRuntimeProfile } from '@chatic/app-runtime';

import { GUEST_MAX_CHANNELS, MAX_CHANNELS_PER_PLACE } from '../utils/consts';

/**
 * App-side permission policy. Web-core/app-runtime expose only raw identity facts (userRole /
 * isGuest / isCloudActive); this hook is where the product decides what a user may do, derived from
 * those facts. Kept in the app layer so permission rules can change without touching the runtime.
 *
 * Owner-only gating for place/group-room CREATION (cloudType === 'owner') is layered on top of these
 * coarse facts by the caller (HomePage), which knows the active cloud's ownership and cloud context
 * (relay 1:1 vs cloud group). See apps/web/docs/feature/home/place-channel-create.md.
 */
export interface UserPermissions {
    canCreateChannel: boolean;
    canCreatePlace: boolean;
    maxChannels: number;
    /**
     * Whether the cloud-entity name editor is available. Currently has NO caller: the MY tree is
     * relay-only (ADR-0062), so the row that used to gate on this is gone from AccountInfoPage. Kept
     * because `/mypage/cloud-profile` still exists and still needs this gate once a cloud-shaped
     * entry point (switcher / 계정 관리) is given to it.
     */
    useCloudProfile: boolean;
    canSelectCloud: boolean;
}

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
