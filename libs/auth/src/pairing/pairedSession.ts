import { RELAY_CLOUD_ID } from '@chatic/data';

import { relayStore, getCommittedCloudId, getRelaySessionUser } from '@chatic/session';
import { pairedClouds } from './pairedClouds';

export const isRelayGuest = (): boolean => {
    const user = getRelaySessionUser() as { userRole?: unknown } | null;
    return !user || user.userRole === 'guest';
};

const issuedByPairing = (token: unknown): boolean => {
    if (typeof token !== 'object' || token === null || !('$auth' in token)) return false;
    const auth = token.$auth;
    if (typeof auth !== 'object' || auth === null) return false;
    return ('purpose' in auth && !!auth.purpose) || ('pairingId' in auth && !!auth.pairingId);
};

export const isPairedSession = (): boolean => {
    if (issuedByPairing(relayStore.getRelayToken())) return true;
    return isRelayGuest() && pairedClouds.list().length > 0;
};

export const isInOwnCloudSession = (): boolean => {
    const cloudId = getCommittedCloudId();
    return !!cloudId && cloudId !== RELAY_CLOUD_ID && !pairedClouds.has(cloudId);
};
