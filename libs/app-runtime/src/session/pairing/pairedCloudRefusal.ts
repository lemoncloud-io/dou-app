import { pairedClouds } from './pairedClouds';
import { pairingErrorStatus } from './pairingRequestFlow';

/**
 * A paired cloud whose delegation the relay refused (403) is over: the approval was revoked, or the
 * approver signed out. It is dropped from the list so the switch sheet stops offering it. Anything else
 * — the network, a server hiccup, a status the browser could not see — leaves it for the next try.
 *
 * Returns whether the cloud was dropped.
 */
export const forgetRefusedPairedCloud = (cloudId: string, error: unknown): boolean => {
    if (!pairedClouds.has(cloudId) || pairingErrorStatus(error) !== 403) return false;
    pairedClouds.remove(cloudId);
    return true;
};
