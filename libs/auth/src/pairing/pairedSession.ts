import { RELAY_CLOUD_ID } from '@chatic/data';

import { relayStore, getCommittedCloudId, getRelaySessionUser } from '@chatic/session';
import { pairedClouds } from './pairedClouds';

/** The relay session is a guest's (or there is none). */
export const isRelayGuest = (): boolean => {
    const user = getRelaySessionUser() as { userRole?: unknown } | null;
    return !user || user.userRole === 'guest';
};

/**
 * Whether a relay token was issued by a pairing: its `$auth` carries `purpose` or `pairingId`. The token
 * type does not declare `$auth`, so it is narrowed here rather than asserted.
 */
const issuedByPairing = (token: unknown): boolean => {
    if (typeof token !== 'object' || token === null || !('$auth' in token)) return false;
    const auth = token.$auth;
    if (typeof auth !== 'object' || auth === null) return false;
    return ('purpose' in auth && !!auth.purpose) || ('pairingId' in auth && !!auth.pairingId);
};

/**
 * Is this device signed in through somebody else's approval — a secondary device?
 *
 * A relay pairing's session says so itself: its `$auth` carries the pairing's `purpose` and
 * `pairingId`, which no other login writes. A device that paired into clouds only is still a guest on
 * the relay, so it counts as secondary when it holds paired clouds. A secondary device signs out when
 * its approver does, so it may neither approve other devices nor list the approvals it never made.
 */
export const isPairedSession = (): boolean => {
    if (issuedByPairing(relayStore.getRelayToken())) return true;
    // Paired clouds make a secondary device of a relay GUEST only: once the device signs in to an
    // account of its own (a phone number, Google), its clouds come from that account.
    return isRelayGuest() && pairedClouds.list().length > 0;
};

/**
 * Is this guest signed in to a cloud on its own — an invite it accepted — rather than through a
 * pairing? A device asks for a pairing only while it is signed out; a guest inside its own cloud is
 * signed in there, and an approval of that same cloud would hand it a second identity in it. DoU Home
 * (the relay) and a paired cloud do not count: the code screen can be opened from either to add a
 * cloud.
 */
export const isInOwnCloudSession = (): boolean => {
    const cloudId = getCommittedCloudId();
    return !!cloudId && cloudId !== RELAY_CLOUD_ID && !pairedClouds.has(cloudId);
};
