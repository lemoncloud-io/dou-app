import { logger } from '@chatic/bridges';

import { alignSessionSite } from '../../socket/auth/alignSessionSite';
import { credentialRenewers } from '../../socket/auth/renewers';
import { reauthenticateActiveSocket } from '../../socket/auth/reauthenticateActiveSocket';
import { createReauthDelegate } from '../../socket/auth/reauthDelegate';
import { getSocketManager } from '../../socket/runtime';
import { slotKeyOf } from '../../socket/utils/slotKey';
import { reissueCloudTokens } from '../auth/cloudTokens';
import { endPairedCloud, isRefusedForEndedPairing } from './pairedCloudRefusal';
import { pairedClouds } from './pairedClouds';

/** How often a paired cloud is re-checked while the app runs. */
export const PAIRED_CLOUD_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type PairedCloudCheck = 'kept' | 'ended' | 'unknown';

/**
 * Re-checks one paired cloud by re-issuing its tokens through the relay's delegation.
 *
 * A cloud server knows nothing of the relay's pairings, so a cloud session can outlive a revoked
 * approval for as long as it keeps renewing itself. The relay's delegation is what does know: once the
 * approval is revoked, or the approver signed out, it answers 403 naming the pairing or the approver
 * (`isRefusedForEndedPairing`). So a paired cloud is re-issued through it on a cadence, and that 403
 * ends the cloud here — the same teardown a cloud whose
 * credential terminally expired gets (its cached tokens dropped, and the session stores cleared when
 * it is the committed cloud), then the list loses it along with the approver's uid recorded there.
 *
 * Anything else — the network, a server error, a 403 for another reason (stale relay credentials), a
 * status the browser could not read — changes nothing; the next round tries again.
 */
export const checkPairedCloud = async (cloudId: string): Promise<PairedCloudCheck> => {
    try {
        await reissuePairedCloud(cloudId);
    } catch (error) {
        if (!isRefusedForEndedPairing(error)) return 'unknown';
        logger.info('SESSION', '[pairedCloudCheck] the relay no longer delegates this paired cloud', {
            data: { cloudId },
        });
        credentialRenewers.forSlot(slotKeyOf(cloudId)).onTerminalExpiry();
        endPairedCloud(cloudId);
        return 'ended';
    }
    return 'kept';
};

/**
 * Re-issues a paired cloud's tokens through the relay's delegation and carries the session along, the
 * way a credential renewal does: the socket serving the cloud re-registers with the new tokens, and
 * the committed cloud is brought back to the selected place if the re-issue landed it on another one.
 *
 * Not `renewCloudSession`, which never throws: a paired cloud needs the 403 to know it ended. Throws
 * only when the re-issue does; the socket half never fails it.
 */
export const reissuePairedCloud = async (cloudId: string): Promise<void> => {
    const landedSiteId = (await reissueCloudTokens(cloudId)).cloudToken.$site?.id;
    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    } catch (error) {
        // The store and cache already hold the new tokens; the socket registers from them on its next
        // handshake.
        logger.warn('SOCKET', '[pairedCloudCheck] socket re-registration failed', { error, data: { cloudId } });
    }
    await alignSessionSite(cloudId, landedSiteId);
};

/** Checks every paired cloud; returns the ones that ended. */
export const checkPairedClouds = async (check = checkPairedCloud): Promise<string[]> => {
    const ids = pairedClouds.list();
    const results = await Promise.all(ids.map(async id => [id, await check(id)] as const));
    return results.filter(([, result]) => result === 'ended').map(([id]) => id);
};
