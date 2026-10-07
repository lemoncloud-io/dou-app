import { logger } from '@chatic/bridges';

import { reissueCloudTokens } from '../../session/auth/cloudTokens';
import { Coalescer } from '../../utils/coalescer';

import { getSocketManager } from '../runtime';
import { alignSessionSite } from './alignSessionSite';
import { reauthenticateActiveSocket } from './reauthenticateActiveSocket';
import { createReauthDelegate } from './reauthDelegate';
import { slotKeyOf } from '../utils/slotKey';

/**
 * Renews one cloud's socket session end to end: re-issue that cloud's tokens, then hand the new
 * identity to that cloud's socket. The cloud counterpart of `applySessionToken` (same store-leads-
 * socket-follows order, same module-level shape so non-React callers can await it).
 *
 * Why this exists: the cloud AWS credential lives about an hour, and the only thing that re-mints it
 * mid-session is the cloud socket's own refresh writeback. While that socket is DOWN — laptop sleep,
 * a dropped connection, a long stay inside one place — nothing measured the credential at all: it
 * simply lapsed, and every cloud-signed request 403'd with no one to notice. Re-entering a cloud hid
 * this (`switchCloudSession` re-issues), so the hole only showed for a session that stayed put.
 *
 * Renewal is RE-ISSUE, not refresh (see `session/auth/cloudTokens`): asking the socket to refresh is
 * exactly what is unavailable here. Where the re-issued tokens land — the session store or only the
 * per-cloud cache — is `reissueCloudTokens`'s call, made at write time by whether the cloud is the
 * committed one; this function does not need to know.
 */
const run = async (cid: string): Promise<boolean> => {
    let landedSiteId: string | undefined;
    try {
        landedSiteId = (await reissueCloudTokens(cid)).cloudToken.$site?.id;
    } catch (error) {
        // Usually the relay leg: `delegate-cloud` is relay-signed, so stale relay credentials fail
        // here too. The caller retries; the relay staleness guard owns that half.
        logger.warn('SESSION', '[renewCloudSession] cloud token re-issue failed', { error, data: { cid } });
        return false;
    }

    try {
        await reauthenticateActiveSocket({
            manager: getSocketManager(),
            delegate: createReauthDelegate(),
            slot: slotKeyOf(cid),
        });
    } catch (error) {
        // HTTP is already fixed by the store commit above — that is the point of the renewal — and the
        // socket re-registers from the store on its next handshake anyway. Never fail the renewal for
        // this half.
        logger.warn('SOCKET', '[renewCloudSession] cloud socket re-registration failed', { error, data: { cid } });
    }
    // A re-issue is not asked for a place — the server picks one, measured as a different place of
    // the same cloud — and the re-registration above moved the socket there.
    await alignSessionSite(cid, landedSiteId);
    return true;
};

/**
 * Single-flight PER CLOUD at module level, not per caller (it was a bespoke `let inFlight`). One
 * cloud's renewal is two HTTP round trips against the same parent identity, so
 * the timer, the foreground trigger and any future 403 handler must collapse into one exchange
 * rather than race each other's writes; two different clouds' renewals are independent and may run
 * side by side. No result memo: unlike the relay refresh there is no burst to absorb here, and a
 * stale "already renewed" answer would skip a genuinely needed re-issue.
 */
const coalescers = new Map<string, Coalescer<boolean>>();

const coalescerFor = (cid: string): Coalescer<boolean> => {
    let coalescer = coalescers.get(cid);
    if (!coalescer) {
        coalescer = new Coalescer<boolean>();
        coalescers.set(cid, coalescer);
    }
    return coalescer;
};

/**
 * Returns true when the cloud tokens were re-issued, false when the exchange failed. Never throws.
 *
 * The socket half is not optional bookkeeping. A cloud slot's binding deliberately carries no
 * identityToken, so neither `SocketBinder` (reboot key is url|deviceId|wssType) nor
 * `SocketReauthBinder` reacts to a token change within the same cloud — without the explicit
 * re-register the SDK would keep replaying the LAPSED token until it burned `maxFailures` and
 * `onAuthExpired` dropped the cloud, i.e. the renewal would fix HTTP and then lose the place anyway.
 */
export const renewCloudSession = (cid: string): Promise<boolean> => coalescerFor(cid).run(() => run(cid));
