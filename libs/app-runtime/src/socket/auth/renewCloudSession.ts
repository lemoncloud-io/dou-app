import { logger } from '@chatic/bridges';

import { reissueCommittedCloudTokens } from '../../session/auth/cloudTokens';

import { getSocketManager } from '../runtime';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { createSocketSessionDelegate } from './sessionDelegate';

/**
 * Renews the ACTIVE cloud session end to end: re-issue the cloud tokens, then hand the new identity
 * to the cloud socket. The cloud counterpart of `applySessionToken` (same store-leads-socket-follows
 * order, same module-level shape so non-React callers can await it).
 *
 * Why this exists: the cloud AWS credential lives about an hour, and the only thing that re-mints it
 * mid-session is the cloud socket's own refresh writeback. While that socket is DOWN — laptop sleep,
 * a dropped connection, a long stay inside one place — nothing measured the credential at all: it
 * simply lapsed, and every cloud-signed request 403'd with no one to notice. Re-entering a cloud hid
 * this (`switchCloudSession` re-issues), so the hole only showed for a session that stayed put.
 *
 * Renewal is RE-ISSUE, not refresh (see `session/auth/cloudTokens`): asking the socket to refresh is
 * exactly what is unavailable here.
 */
const run = async (): Promise<boolean> => {
    let reissued: boolean;
    try {
        reissued = await reissueCommittedCloudTokens();
    } catch (error) {
        // Usually the relay leg: `delegate-cloud` is relay-signed, so stale relay credentials fail
        // here too. The caller retries; the relay staleness guard owns that half.
        logger.warn('SESSION', '[renewCloudSession] cloud token re-issue failed', { error });
        return false;
    }
    if (!reissued) {
        // No committed cloud — relay-only session, nothing to renew.
        return false;
    }

    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createSocketSessionDelegate(),
            kind: 'cloud',
        });
    } catch (error) {
        // HTTP is already fixed by the store commit above — that is the point of the renewal — and the
        // socket re-registers from the store on its next handshake anyway. Never fail the renewal for
        // this half.
        logger.warn('SOCKET', '[renewCloudSession] cloud socket re-registration failed', { error });
    }
    return true;
};

let inFlight: Promise<boolean> | null = null;

/**
 * Returns true when the cloud tokens were re-issued, false when there was nothing to renew or the
 * exchange failed. Never throws.
 *
 * Single-flight at MODULE level, not per caller: the renewal is two HTTP round trips against the same
 * parent identity, and the timer, the foreground trigger and any future 403 handler must collapse into
 * one exchange rather than race each other's writes into the cloud store.
 *
 * The socket half is not optional bookkeeping. The cloud slot's binding deliberately carries no
 * identityToken, so neither `SocketBinder` (reboot key is url|deviceId|wssType) nor
 * `SocketReauthBinder` reacts to a same-wss token change (multi-socket-design.md §6-7) — without the
 * explicit re-register the SDK would keep replaying the LAPSED token until it burned `maxFailures`
 * and `onAuthExpired` dropped the user out of the cloud, i.e. the renewal would fix HTTP and then
 * lose the place anyway.
 */
export const renewCloudSession = async (): Promise<boolean> => {
    if (inFlight) {
        return await inFlight;
    }
    inFlight = run();
    try {
        return await inFlight;
    } finally {
        inFlight = null;
    }
};
