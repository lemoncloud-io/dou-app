import { relayStore } from '../store/stores';
import { getRelaySessionUser } from '../store';
import { pairedClouds } from './pairedClouds';

/** The relay session is a guest's (or there is none). */
export const isRelayGuest = (): boolean => {
    const user = getRelaySessionUser() as { userRole?: unknown } | null;
    return !user || user.userRole === 'guest';
};

type AuthRecord = { purpose?: unknown; pairingId?: unknown };

/**
 * Is this device signed in through somebody else's approval — a secondary device?
 *
 * A relay pairing's session says so itself: its `$auth` carries the pairing's `purpose` and
 * `pairingId`, which no other login writes. A device that paired into clouds only is still a guest on
 * the relay, so it counts as secondary when it holds paired clouds. A secondary device signs out when
 * its approver does, so it may neither approve other devices nor list the approvals it never made.
 */
export const isPairedSession = (): boolean => {
    const token = relayStore.getRelayToken() as unknown as { $auth?: AuthRecord } | null;
    const auth = token?.$auth;
    if (auth && (!!auth.purpose || !!auth.pairingId)) return true;
    // Paired clouds make a secondary device of a relay GUEST only: once the device signs in to an
    // account of its own (a phone number, Google), its clouds come from that account.
    return isRelayGuest() && pairedClouds.list().length > 0;
};
