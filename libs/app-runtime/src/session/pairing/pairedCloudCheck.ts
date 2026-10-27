import { logger } from '@chatic/bridges';

import { credentialRenewers } from '../../socket/auth/renewers';
import { reauthenticateActiveSocket } from '../../socket/auth/reauthenticateActiveSocket';
import { createReauthDelegate } from '../../socket/auth/reauthDelegate';
import { getSocketManager } from '../../socket/runtime';
import { slotKeyOf } from '../../socket/utils/slotKey';
import { reissueCloudTokens } from '../auth/cloudTokens';
import { pairedClouds } from './pairedClouds';
import { pairingErrorStatus } from './pairingRequestFlow';

/** How often a paired cloud is re-checked while the app runs. */
export const PAIRED_CLOUD_CHECK_INTERVAL_MS = 10 * 60 * 1000;

export type PairedCloudCheck = 'kept' | 'ended' | 'unknown';

/**
 * Re-checks one paired cloud by re-issuing its tokens through the relay's delegation.
 *
 * A cloud server knows nothing of the relay's pairings, so a cloud session can outlive a revoked
 * approval for as long as it keeps renewing itself. The relay's delegation is what does know: once the
 * approval is revoked, or the approver signed out, it answers 403. So a paired cloud is re-issued
 * through it on a cadence, and a 403 ends that cloud here — the same teardown a cloud whose
 * credential terminally expired gets (its cached tokens dropped, and the session stores cleared when
 * it is the committed cloud), then the list loses it.
 *
 * Anything but a 403 — the network, a server error, a status the browser could not read — changes
 * nothing; the next round tries again.
 */
export const checkPairedCloud = async (cloudId: string): Promise<PairedCloudCheck> => {
    try {
        await reissueCloudTokens(cloudId);
    } catch (error) {
        if (pairingErrorStatus(error) !== 403) return 'unknown';
        logger.info('SESSION', '[pairedCloudCheck] the relay no longer delegates this paired cloud', {
            data: { cloudId },
        });
        credentialRenewers.forSlot(slotKeyOf(cloudId)).onTerminalExpiry();
        pairedClouds.remove(cloudId);
        return 'ended';
    }
    try {
        // The re-issued tokens are in the store; the socket follows them, as a renewal does.
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cloudId),
        });
    } catch (error) {
        logger.warn('SOCKET', '[pairedCloudCheck] socket re-registration failed', { error, data: { cloudId } });
    }
    return 'kept';
};

/** Checks every paired cloud; returns the ones that ended. */
export const checkPairedClouds = async (check = checkPairedCloud): Promise<string[]> => {
    const ids = pairedClouds.list();
    const results = await Promise.all(ids.map(async id => [id, await check(id)] as const));
    return results.filter(([, result]) => result === 'ended').map(([id]) => id);
};
