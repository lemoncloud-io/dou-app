import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';

import { getRepositories } from '../../data/runtime';
import { cloudStore } from '../store/stores';
import { notifySessionStateChanged, rebuildSessionIdentity } from '../store';
import type { IAuthRepositoryV2 } from '@chatic/data';

/**
 * Cloud token ISSUANCE — deliberately off the session barrel (like `auth/authActions`).
 *
 * **Cloud recovery is re-issue, not refresh.** A cloud token is minted from the relay identity
 * (`delegate-cloud` is relay-signed HTTP), so as long as relay lives there is always a way to mint a
 * fresh one — `auth.refresh` on the cloud socket is an optimization, not the only route. Relay has no
 * such parent: its token can only be refreshed or re-logged-in. That asymmetry is the whole reason
 * relay and cloud manage their tokens separately, and it is why `useSessionStalenessGuard` (refresh)
 * is relay-only while the cloud counterpart (`useCloudCredentialGuard`) re-issues.
 *
 * Two callers with two different intents share the exchange below:
 *  - `switchCloudSession` (services.ts) — ENTERING a cloud. May replay the per-cloud cache, and owns
 *    the selection (cid/sid) bookkeeping around the exchange.
 *  - `reissueCommittedCloudTokens` (here) — the cloud we are ALREADY in, whose AWS credential is
 *    about to lapse. Never replays the cache (that is where the lapsing copy lives) and never touches
 *    the selection: the user has not navigated anywhere.
 */
const authRepository = (): IAuthRepositoryV2 => getRepositories().auth;

export interface IssuedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

/**
 * Runs (or replays from the per-cloud cache) the two-call cloud token exchange for `cloudId` and
 * records the result in that cache. Commits nothing to the active cloud slot — what a successful
 * issue MEANS for the session is the caller's decision.
 */
export const issueCloudTokens = async (
    cloudId: string,
    { allowCache }: { allowCache: boolean }
): Promise<IssuedCloudTokens> => {
    if (allowCache) {
        // Margin-checked inside the store: an entry whose credential is nearly out is dropped, not served.
        const cached = cloudStore.getCachedCloudTokens(cloudId);
        if (cached) {
            return cached;
        }
    }

    const delegationToken = await authRepository().delegateCloud(cloudId);
    const cloudToken = await authRepository().exchangeToken({
        baseURL: delegationToken.backend as string,
        body: { delegationToken: delegationToken.delegationToken },
    });

    cloudStore.setCachedCloudTokens(cloudId, { delegationToken, cloudToken });
    return { delegationToken, cloudToken };
};

/**
 * Re-issues the tokens of the cloud we are already COMMITTED to, leaving the selection untouched.
 *
 * "Committed" is read off the delegation token exactly as `getCommittedCloudId` does — the selected
 * cid flips optimistically at the start of a switch, and renewing the cloud a switch is still
 * reaching for would exchange against the wrong parent.
 *
 * Returns false when there is no committed cloud (nothing to renew). Throws when the exchange fails,
 * so the caller can decide whether that is worth retrying.
 */
export const reissueCommittedCloudTokens = async (): Promise<boolean> => {
    const cloudId = cloudStore.getDelegationToken()?.cloudId ?? null;
    if (!cloudId) {
        return false;
    }

    // Cache bypassed on purpose: the entry was written by the very issue that is now lapsing, and its
    // own 60s margin would happily serve it back — a renewal that renews nothing.
    const { delegationToken, cloudToken } = await issueCloudTokens(cloudId, { allowCache: false });

    cloudStore.saveDelegationToken(delegationToken);
    // Merge, mirroring switchCloudSession's same-cloud branch: a re-issue is not guaranteed to carry
    // every field the stored view holds (profile fields notably), and this is not a cloud CHANGE.
    const existing = cloudStore.getCloudToken();
    cloudStore.saveCloudToken(existing ? ({ ...existing, ...cloudToken } as UserTokenView) : cloudToken);

    // Re-derive uid/identity from the freshly written token, same as every other commit path.
    rebuildSessionIdentity();
    notifySessionStateChanged();
    logger.info('SESSION', '[cloudTokens] committed cloud tokens re-issued', { data: { cloudId } });
    return true;
};
