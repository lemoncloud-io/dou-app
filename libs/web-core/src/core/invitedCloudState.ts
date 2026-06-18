import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { storage } from '@chatic/shared';
import { cloudCore, CLOUD_INVITED_BUNDLES_KEY } from './cloudCore';

/**
 * Deprecated compatibility layer.
 * Invite-cloud persistence will be folded behind session usecases, so new code
 * should avoid depending on this module directly beyond migration paths.
 */

export interface InvitedCloudBundle {
    delegation: CloudDelegationTokenView | null;
    cloudToken: UserTokenView;
    siteId?: string;
    name?: string;
}

const readInvitedBundles = (): Record<string, InvitedCloudBundle> => {
    const raw = storage.get(CLOUD_INVITED_BUNDLES_KEY);
    return raw ? (JSON.parse(raw) as Record<string, InvitedCloudBundle>) : {};
};

export const captureInvitedCloud = (cloudId: string, name?: string): void => {
    const cloudToken = cloudCore.getCloudToken();
    if (!cloudId || !cloudToken) return;

    const bundles = readInvitedBundles();
    bundles[cloudId] = {
        delegation: cloudCore.getDelegationToken(),
        cloudToken,
        siteId: cloudCore.getSelectedSiteId() ?? undefined,
        name,
    };
    storage.set(CLOUD_INVITED_BUNDLES_KEY, JSON.stringify(bundles));
};

export const getInvitedCloud = (cloudId: string): InvitedCloudBundle | null => {
    return readInvitedBundles()[cloudId] ?? null;
};

export const applyInvitedCloud = (cloudId: string): boolean => {
    const bundle = readInvitedBundles()[cloudId];
    if (!bundle) return false;

    if (bundle.delegation) cloudCore.saveDelegationToken(bundle.delegation);
    cloudCore.saveCloudToken(bundle.cloudToken);
    cloudCore.saveSelectedCloudId(cloudId);

    if (bundle.siteId) {
        cloudCore.saveSelectedSiteId(bundle.siteId);
    } else {
        cloudCore.clearSelectedSite();
    }

    return true;
};

export const clearInvitedCloud = (cloudId: string): void => {
    const bundles = readInvitedBundles();
    if (!(cloudId in bundles)) return;
    delete bundles[cloudId];
    storage.set(CLOUD_INVITED_BUNDLES_KEY, JSON.stringify(bundles));
};

export const clearInvitedClouds = (): void => {
    storage.remove(CLOUD_INVITED_BUNDLES_KEY);
};
