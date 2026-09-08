import { logger } from '@chatic/bridges';

import { cloudStore } from '../store/stores';
import { getCloudSessionSnapshot, rebuildSessionIdentity, sessionSignal, setSelectedSiteId } from '../store';
import type { CloudSessionSnapshot } from '../store';
import { issueCloudTokens } from './cloudTokens';

/**
 * The CLOUD half of the session hub's use-cases (ADR-0076 결정 5) — entering a cloud, leaving it, and
 * moving the selected site.
 *
 * Split out of the 550-line `services.ts` because the two halves share nothing but the stores: relay
 * owns login and the account, cloud owns the delegated session on top of it. The asymmetry runs all
 * the way down (relay refreshes, cloud re-issues — see `socket/auth/renewers.ts`), so one file per
 * server reads the way the runtime actually works.
 *
 * `ICloudSession` / `CloudSession` with no suffix, like `ActiveScope`: `*Service` has zero
 * precedent in this repo's libs and `*Manager` is reserved for ADR-0070's four engines.
 *
 * The token exchange itself stays in `./cloudTokens` — it is shared with the renewal path, which
 * enters through `socket/auth/renewCloudSession` rather than through this class.
 */
export interface ICloudSession {
    /** Enters `cloudId`: optimistic cid pre-apply, token exchange, commit. Rolls back on failure. */
    switchTo(cloudId: string): Promise<CloudSessionSnapshot>;
    /** Clears the cloud stores, keeping relay. NOT the app-facing logout — see the method doc. */
    clearStores(): void;
    /** Moves (or rolls back) the selected site. */
    applySelectedSite(siteId: string | null): void;
}

const buildSnapshotFallback = (cloudId: string, siteId: string | null): CloudSessionSnapshot => {
    return {
        cloudId,
        siteId,
        identityToken: cloudStore.getIdentityToken(),
        backend: cloudStore.getBackend(),
        wss: cloudStore.getWss(),
    };
};

class CloudSession implements ICloudSession {
    /**
     * Switches the active cloud session by exchanging a delegation token for a cloud token.
     *
     * The cid is pre-applied optimistically before the exchange so app-runtime's cid-scoped
     * cache observers re-subscribe to the target cloud immediately (mirrors the optimistic sid
     * in `applySelectedSite`). Tokens are persisted only on success, so a failed exchange rolls
     * cid/sid back to the previous cloud and the previous cloud's tokens stay valid.
     */
    async switchTo(cloudId: string): Promise<CloudSessionSnapshot> {
        const previousCloudId = cloudStore.getSelectedCloudId();
        const previousSiteId = cloudStore.getSelectedSiteId();
        const isCloudChange = previousCloudId !== cloudId;

        // Optimistic cid pre-apply: flip the selected cloud (and drop the previous site) before
        // the token exchange. activeServer keeps the old socket until the new tokens commit, but
        // cid-derived observers swap to the target cloud's cache right away.
        if (isCloudChange) {
            cloudStore.saveSelectedCloudId(cloudId);
            cloudStore.clearSelectedSite();
        }

        try {
            // Reuse a recently-issued token for this cloud when still valid → skip both HTTP token
            // exchanges, so the cloud identity (uid) commits instantly and the cid+uid-scoped local cache
            // reads immediately on a re-switch (multi-socket-design.md perf: cloud-switch cache warmth).
            // The exchange itself lives in `./cloudTokens`, shared with the renewal path that re-issues
            // the cloud we are already in (which passes allowCache: false — see that module).
            const { delegationToken: cloudDelegationToken, cloudToken: userToken } = await issueCloudTokens(cloudId, {
                allowCache: true,
            });

            // The commit is ONE observable change (ADR-0076 결정 2). Before this batch the success path
            // fired the session signal eight times, so seven inconsistent intermediate states were
            // visible to every observer — selected cloud moved but tokens had not, tokens landed but the
            // identity had not re-derived, and so on. The optimistic pre-apply above stays OUTSIDE the
            // batch on purpose: flipping the cid early is the whole point of optimistic switching, so it
            // must be observable immediately.
            sessionSignal.batch(() => {
                cloudStore.saveDelegationToken(cloudDelegationToken);
                const existingToken = isCloudChange ? null : cloudStore.getCloudToken();
                cloudStore.saveCloudToken(
                    existingToken ? ({ ...existingToken, ...userToken } as typeof userToken) : userToken
                );
                cloudStore.saveSelectedCloudId(cloudId);

                // Cloud token is saved above; rebuild identity so uid re-derives from the now-active
                // cloud. The selected cloud id is NOT re-applied here: `saveSelectedCloudId` above
                // already wrote it, and `setSelectedCloudId` is that same call.
                rebuildSessionIdentity();
            });

            return getCloudSessionSnapshot() ?? buildSnapshotFallback(cloudId, cloudStore.getSelectedSiteId());
        } catch (error) {
            // Roll the optimistic cid/sid back. Tokens were never overwritten on failure, so the
            // previous cloud session is still intact and usable.
            if (isCloudChange) {
                cloudStore.saveSelectedCloudId(previousCloudId ?? 'default');
                if (previousSiteId) {
                    cloudStore.saveSelectedSiteId(previousSiteId);
                } else {
                    cloudStore.clearSelectedSite();
                }
            }
            logger.error('SESSION', '[service] switchCloudSession failed', { error, data: { cloudId } });
            throw error;
        }
    }

    /**
     * Clears the cloud stores while keeping relay authentication intact. **Not the app-facing cloud
     * logout** — that is `socket/auth/logoutCloudSession`, which notifies the cloud socket first.
     * Renamed off `logoutCloudSession` by ADR-0076 결정 7 (see `clearSessionAndRedirect`).
     */
    clearStores(): void {
        // Fully leave the cloud: clear the delegation + cloud token AND the selected cloud/site so
        // `cloud.isActive` flips to false and uid / activeServer fall back to relay ("return to default
        // cloud, keep relay"). Clearing only the delegation token left cloud.isActive true — the session
        // stayed pinned to the cloud (stale uid/activeServer). Re-entry re-issues fresh tokens anyway.
        // One observable change: `clearSession` announces `cloud:token` + `selection` inside its own
        // batch, and `rebuildSessionIdentity` adds `identity` only if the derived identity actually moved.
        sessionSignal.batch(() => {
            cloudStore.clearSession();
            rebuildSessionIdentity();
        });
    }

    /**
     * Optimistically applies (or rolls back) the selected site for the app-runtime socket-driven site
     * switch (SDK `auth.switch`, multi-socket-design.md §8-2). Moves only the selected-site read model so
     * cid/sid-scoped caches swap immediately; app-runtime reuses it to roll the sid back if the socket
     * switch fails. `setSelectedSiteId` routes to relay/cloud store by active cloud; notify re-renders
     * `activeServer.siteId` observers.
     *
     * The HTTP counterpart (`switchSiteSession`, which committed a switch by re-issuing the token) is
     * gone — every app drives the switch through the socket, and this primitive is what the socket path
     * uses to move the read model.
     */
    applySelectedSite(siteId: string | null): void {
        // `setSelectedSiteId` routes to the relay or cloud store by active cloud, and both emit
        // `selection` — no extra broadcast needed.
        setSelectedSiteId(siteId);
    }
}

/** Stateless — reads the stores live per call, so one instance serves the whole app. */
export const cloudSession: ICloudSession = new CloudSession();

/**
 * No named wrappers. Consumers reach the methods through the singleton above — the same shape as
 * `credentialFreshness` and `sessionAuthAdapter`, and the reason is in `relaySession.ts`'s note.
 * `useSwitchCloudSession` (the app's surface for a switch) calls `cloudSession.switchTo(cloudId)`.
 */
