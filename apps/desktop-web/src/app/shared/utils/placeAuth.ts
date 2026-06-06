import { useWebSocketV2Store } from '@chatic/socket';
import { cloudCore, useWebCoreStore } from '@chatic/web-core';
import type { UserProfile$ } from '@lemoncloud/chatic-backend-api';

import { waitForVerified } from './waitForVerified';

/**
 * Switch the active place (site). In relay mode this just records the selection;
 * in cloud mode it refreshes the per-place token (`uid@placeId`), updates the
 * profile, and re-runs the socket auth handshake before resolving.
 *
 * Mirrors apps/web PlaceList cloud-mode logic so desktop place switching stays
 * in sync with the engine instead of only mutating local UI state.
 */
export const authPlace = async (placeId: string): Promise<void> => {
    const wssType = useWebSocketV2Store.getState().wssType;

    if (wssType !== 'cloud') {
        cloudCore.saveSelectedSiteId(placeId);
        useWebSocketV2Store.getState().setSelectedPlaceId(placeId);
        return;
    }

    const uid = cloudCore.getCloudToken()?.id;
    if (!uid) throw new Error('No cloud token uid for place auth');

    const refreshed = await cloudCore.refreshToken(`${uid}@${placeId}`);
    cloudCore.saveSelectedSiteId(placeId);
    useWebSocketV2Store.getState().setSelectedPlaceId(placeId);

    const currentProfile = useWebCoreStore.getState().profile;
    const { Token: _token, ...cloudProfile } = refreshed;
    useWebCoreStore.getState().setProfile({ ...currentProfile, ...cloudProfile } as unknown as UserProfile$);

    // useCloudTokenRefresh observes isVerified=false → emits auth:update.
    useWebSocketV2Store.getState().setIsVerified(false);

    const ok = await waitForVerified(5000);
    if (!ok) throw new Error('Place auth timeout');
};
