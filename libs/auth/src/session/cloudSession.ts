import { logger } from '@chatic/logger';

import {
    cloudStore,
    getCloudSessionSnapshot,
    rebuildSessionIdentity,
    sessionSignal,
    setSelectedSiteId,
} from '@chatic/session';
import type { CloudSessionSnapshot } from '@chatic/session';
import { issueCloudTokens, type IssuedCloudTokens } from './cloudTokens';
import { recordCloudIdentity } from './cloudIdentity';

export interface SwitchCloudOptions {
    hasLiveSlot?: boolean;
    issuedTokens?: IssuedCloudTokens;
}

export interface ICloudSession {
    switchTo(cloudId: string, options?: SwitchCloudOptions): Promise<CloudSessionSnapshot>;
    clearStores(): void;
    applySelectedSite(siteId: string | null): void;
}

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    return {
        cloudId,
        siteId,
        identityToken: cloudStore.getIdentityToken(),
        backend: cloudStore.getBackend(),
        wss: cloudStore.getWss(),
    };
};

class CloudSession implements ICloudSession {
    async switchTo(
        cloudId: string,
        { hasLiveSlot = false, issuedTokens }: SwitchCloudOptions = {}
    ): Promise<CloudSessionSnapshot> {
        const previousCloudId = cloudStore.getSelectedCloudId();
        const previousSiteId = cloudStore.getSelectedSiteId();
        const isCloudChange = previousCloudId !== cloudId;

        if (isCloudChange) {
            cloudStore.saveSelectedCloudId(cloudId);
            cloudStore.clearSelectedSite();
        }

        try {
            const live = hasLiveSlot ? cloudStore.peekCachedCloudTokens(cloudId) : null;
            const { delegationToken: cloudDelegationToken, cloudToken: userToken } =
                issuedTokens ?? live ?? (await issueCloudTokens(cloudId, { allowCache: true }));
            if (issuedTokens) {
                cloudStore.setCachedCloudTokens(cloudId, issuedTokens);
                recordCloudIdentity(cloudId, issuedTokens.cloudToken);
            }

            sessionSignal.batch(() => {
                cloudStore.saveDelegationToken(cloudDelegationToken);
                const existingToken = isCloudChange || issuedTokens ? null : cloudStore.getCloudToken();
                cloudStore.saveCloudToken(
                    existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken
                );
                cloudStore.saveSelectedCloudId(cloudId);
                if (issuedTokens && !isCloudChange) cloudStore.clearSelectedSite();
                cloudStore.recordCloudUse(cloudId);

                rebuildSessionIdentity();
            });

            return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudStore.getSelectedSiteId());
        } catch (error) {
            if (isCloudChange) {
                cloudStore.saveSelectedCloudId(previousCloudId ?? 'default');
                if (previousSiteId) {
                    cloudStore.saveSelectedSiteId(previousSiteId);
                } else {
                    cloudStore.clearSelectedSite();
                }
            }
            logger.error('SESSION', '[service] switchCloudSession failed', { error, data: { cloudId } });
            throw error;
        }
    }

    clearStores(): void {
        sessionSignal.batch(() => {
            cloudStore.clearSession();
            rebuildSessionIdentity();
        });
    }

    applySelectedSite(siteId: string | null): void {
        setSelectedSiteId(siteId);
    }
}

export const cloudSession: ICloudSession = new CloudSession();
