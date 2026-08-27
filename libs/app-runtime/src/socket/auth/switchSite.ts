import { perfNow, reportPerfMetric } from '@chatic/bridges';
import { applySelectedSite, getGlobalSessionContext, getSelectedSiteId } from '@chatic/web-core';

import { getSocketManager } from '../runtime';

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
 * This is also where the `site-switch` budget is measured (ADR-0071), rather than in the mutation
 * wrapper one level up: the no-op return below would otherwise contribute a stream of ~0ms samples
 * and deflate the p95. Everything past that guard is real work, and since this function IS the
 * mutation's `mutationFn`, "until the mutation resolves" still describes the endpoint exactly.
 * Failures are reported too (`ok: false`) — a switch slow enough to fail is precisely the sample
 * the tail is made of.
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

    const startedAt = perfNow();

    // Optimistic pre-apply (also the rollback target below).
    applySelectedSite(siteId);

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
        reportPerfMetric('site-switch', perfNow() - startedAt, { ok: true });
    } catch (error) {
        // Roll the optimistic sid back to the previous site; the committed token was never changed.
        applySelectedSite(prevSiteId);
        reportPerfMetric('site-switch', perfNow() - startedAt, { ok: false });
        throw error;
    }
};
