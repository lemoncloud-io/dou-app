import { startPerfTrace } from '@chatic/perf';
import { cloudSession } from '../../session/auth/cloudSession';
import { getGlobalSessionContext, getSelectedSiteId } from '../../session/store';

import { getSocketManager } from '../runtime';
import { handleRevokedRelaySession, isRevokedSessionError } from './revokedSession';

/**
 * Switches the active site on the live socket via the SDK `auth.switch` — owned by app-runtime now
 * that ClientSocketAuth performs the switch (multi-socket-design.md §8-2). Apps wrap this in a
 * react-query mutation (keyed by web-core's SWITCH_SITE_MUTATION_KEY) for `isSwitching` + the global
 * in-flight observer; the switch logic itself lives here.
 *
 * Flow: optimistically pre-apply the sid (web-core `applySelectedSite`, so cid/sid-scoped caches
 * swap immediately) → wait for the socket to be verified → `auth.switch(`${uid}@${sid}`)`. The new
 * token+sid land back in web-core via the SDK `onTokenRefresh` writeback. On failure (sign reject /
 * server rejection / not-connected) the optimistic sid is rolled back to the previous site; the
 * committed token is untouched on failure, so the previous session stays intact.
 *
 * This is also where the `site_switch` trace is taken, rather than in the mutation wrapper one level
 * up: the no-op return below would otherwise contribute a stream of ~0ms samples and deflate the
 * p95. Everything past that guard is real work, and since this function IS the mutation's
 * `mutationFn`, "until the mutation resolves" still describes the endpoint exactly. Failures are
 * recorded too (`outcome: error`) — a switch slow enough to fail is precisely the sample the tail is
 * made of.
 */
export const switchSite = async (siteId: string): Promise<void> => {
    const prevSiteId = getSelectedSiteId();
    if (siteId === prevSiteId) {
        return;
    }

    const uid = getGlobalSessionContext().identity.userId;
    if (!uid) {
        throw new Error('[switchSiteViaSocket] no active user id for site switch');
    }

    const trace = startPerfTrace('site_switch');

    // Optimistic pre-apply (also the rollback target below).
    cloudSession.applySelectedSite(siteId);

    try {
        const manager = getSocketManager();
        // auth.switch on a not-connected socket rejects (AuthSwitchError phase 'not-connected'), so
        // give a briefly-reconnecting socket a chance to verify first.
        await manager.waitUntilVerified();

        const auth = manager.getClient()?.auth;
        if (!auth) {
            throw new Error('[switchSiteViaSocket] socket auth controller unavailable');
        }
        await auth.switch(`${uid}@${siteId}`);
        trace.putAttribute('outcome', 'ok');
        trace.stop();
    } catch (error) {
        // Roll the optimistic sid back to the previous site; the committed token was never changed.
        cloudSession.applySelectedSite(prevSiteId);
        trace.putAttribute('outcome', 'error');
        trace.stop();
        // `auth.switch` is the ONLY surface that carries the server's revoked-session rejection to us
        // (`AuthSwitchError.cause`; refresh and signed HTTP both lose it — see `revokedSession`). A
        // revoked session cannot be switched, refreshed or delegated from, so this rejection is the
        // session's verdict rather than this switch's: end it here instead of letting every later
        // screen fail on its own. Fire-and-forget — the caller still gets its rejection to roll back
        // with, and the teardown redirects on its own.
        if (isRevokedSessionError(error)) {
            void handleRevokedRelaySession('auth.switch');
        }
        throw error;
    }
};
