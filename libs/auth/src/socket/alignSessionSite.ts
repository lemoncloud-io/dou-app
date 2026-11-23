import { logger } from '@chatic/logger';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { cloudSession } from '../session/cloudSession';
import { getCommittedCloudId, getGlobalSessionContext, getSelectedSiteId, cloudStore } from '@chatic/session';
import { getSocketManager } from '@chatic/transport';
import { isSiteSwitchInFlight } from './switchSite';

let aligning = false;

export const alignSessionSite = async (cid: string, landedSiteId: string | undefined): Promise<void> => {
    if (cid === RELAY_CLOUD_ID || cid !== getCommittedCloudId()) return;
    const selectedSiteId = getSelectedSiteId();
    if (!selectedSiteId || !landedSiteId || selectedSiteId === landedSiteId) return;
    if (aligning || isSiteSwitchInFlight()) return;

    aligning = true;
    logger.warn('SESSION', '[alignSessionSite] the session left the selected place; switching back', {
        data: { cid, selected: selectedSiteId, landed: landedSiteId },
    });
    try {
        const uid = getGlobalSessionContext().identity.userId;
        if (!uid) throw new Error('[alignSessionSite] no active user id');
        const manager = getSocketManager();
        await manager.waitUntilVerified();
        const auth = manager.getClient()?.auth;
        if (!auth) throw new Error('[alignSessionSite] socket auth controller unavailable');
        await auth.switch(`${uid}@${selectedSiteId}`);
    } catch (error) {
        logger.warn('SESSION', '[alignSessionSite] could not switch back; following the session instead', {
            error,
            data: { cid, selected: selectedSiteId, landed: landedSiteId },
        });
        if (getSelectedSiteId() === selectedSiteId) cloudSession.applySelectedSite(landedSiteId);
    } finally {
        aligning = false;
    }
};

export const alignStoredSessionSite = (cid: string): Promise<void> =>
    alignSessionSite(cid, cid === RELAY_CLOUD_ID ? undefined : cloudStore.getCloudTokenOf(cid)?.$site?.id);
