import { cloudStore } from '../store/stores';
import { pairedClouds } from './pairedClouds';
import { pairingErrorReason, pairingErrorStatus } from './pairingRequestFlow';

/**
 * A paired cloud is over: it leaves the list, and the uid recorded for it is forgotten.
 *
 * That uid is the approver's — entering by delegation records whoever the relay answered for — and the
 * identity map outlives tokens on purpose, so left alone it would go on naming the approver as this
 * tab's identity there and partition that cloud's cache under the approver. A tab with a membership of
 * its own in the cloud (an invite) records its own uid again the next time it enters.
 */
export const endPairedCloud = (cloudId: string): void => {
    pairedClouds.remove(cloudId);
    cloudStore.dropCloudIdentity(cloudId);
};

/**
 * Whether the relay refused a cloud because a pairing behind it has ended: a 403 whose reason names the
 * pairing or its approver (`pairing revoked`, `pairing not found`, `approver session revoked`,
 * `approver banned`, …) — every refusal the relay's delegation gives once an approval no longer holds.
 *
 * Only those. A 403 for any other reason — notably a request signed with relay credentials that went
 * stale while the app was closed, which the relay refuses the same way — says nothing about the
 * approval, and treating it as an ended one would sign a device out for nothing.
 *
 * It does not look at the paired clouds: the relay ties an ended pairing to the auth session that
 * claimed it and refuses that session's way into the cloud even through an invite of its own, so the
 * refusal can come on a cloud that is not a paired one.
 */
export const isRefusedForEndedPairing = (error: unknown): boolean =>
    pairingErrorStatus(error) === 403 && /\b(pairing|approver)\b/.test(pairingErrorReason(error));

/**
 * A paired cloud whose delegation the relay refused over an ended pairing is over: the approval was
 * revoked, or the approver signed out. It ends here so the switch sheet stops offering it. Anything
 * else — the network, a server hiccup, another 403 — leaves it for the next try.
 *
 * Returns whether the cloud was ended.
 */
export const forgetRefusedPairedCloud = (cloudId: string, error: unknown): boolean => {
    if (!pairedClouds.has(cloudId) || !isRefusedForEndedPairing(error)) return false;
    endPairedCloud(cloudId);
    return true;
};
