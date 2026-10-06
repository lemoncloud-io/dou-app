import { logger } from '@chatic/bridges';
import { RELAY_CLOUD_ID } from '@chatic/data';

import { cloudSession } from '../../session/auth/cloudSession';
import { getCommittedCloudId, getGlobalSessionContext, getSelectedSiteId } from '../../session/store';
import { cloudStore } from '../../session/store/stores';
import { getSocketManager } from '../runtime';
import { isSiteSwitchInFlight } from './switchSite';

/** One alignment at a time: its own `auth.switch` writes a token back, which calls in here again. */
let aligning = false;

/**
 * Brings the committed cloud's socket session back to the selected place after a token landed it
 * somewhere else.
 *
 * The selection and the session's site are two records that nothing else keeps equal. A token the
 * server issues without being asked for a place — a credential renewal re-issued through
 * `delegate-cloud`, measured landing on another place of the same cloud — re-registers the socket
 * there and leaves the selection alone. From then on the screen names one place while every
 * site-scoped call (a place invite, a profile save) lands on another, and a reload keeps both.
 *
 * The selection is what the user chose and what the screen shows, so the session is switched back to
 * it. When that switch fails the selection follows the server instead: two records that agree on the
 * wrong place are better than a screen that names one place and acts on another.
 *
 * Only the committed cloud: a background slot has no selection to disagree with. The relay is left
 * out because its token names a personal place (`P…`) that is never the selected id, by design. A
 * switch in flight is not drift — a token written back during it may still name the place being left.
 *
 * Never throws: it runs from token writebacks, which must not fail for this half.
 */
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
        // Only if nothing moved the selection meanwhile — a user's tap during the attempt wins.
        if (getSelectedSiteId() === selectedSiteId) cloudSession.applySelectedSite(landedSiteId);
    } finally {
        aligning = false;
    }
};

/** {@link alignSessionSite} against the place the stored token names — for a session that wrote nothing back. */
export const alignStoredSessionSite = (cid: string): Promise<void> =>
    alignSessionSite(cid, cid === RELAY_CLOUD_ID ? undefined : cloudStore.getCloudTokenOf(cid)?.$site?.id);
