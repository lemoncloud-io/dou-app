import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/bridges';

import { getRepositories } from '../../data/runtime';
import { cloudStore } from '../store/stores';
import { msUntilExpiration } from '../store/expiry';
import { rebuildSessionIdentity, sessionSignal } from '../store';
import { recordCloudIdentity } from './cloudIdentity';
import type { IAuthRepository } from '@chatic/data';

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
 *  - `cloudSession.switchTo` — ENTERING a cloud. May replay the per-cloud cache, and owns the
 *    selection (cid/sid) bookkeeping around the exchange.
 *  - `reissueCloudTokens` (here) — a cloud whose socket session is already up and whose credential
 *    is about to lapse. Never replays the cache (that is where the lapsing copy lives) and never
 *    touches the selection: the user has not navigated anywhere.
 */
const authRepository = (): IAuthRepository => getRepositories().auth;

export interface IssuedCloudTokens {
    delegationToken: CloudDelegationTokenView;
    cloudToken: UserTokenView;
}

/** What an invite login answered with, and where the invited cloud lives. */
export interface InviteLoginEntry {
    /** The invite login's answer: the invitee's own cloud token, from the cloud backend itself. */
    cloudToken: UserTokenView;
    /** The cloud's REST endpoint — the one the invite login was sent to. */
    backend?: string;
    /** The cloud's socket endpoint, from the invite. */
    wss?: string;
}

/**
 * The tokens an invite login answered with, in the shape a switch commits. Null when the answer
 * cannot be entered with — no identity token, or no endpoint to reach the cloud at — and the caller
 * falls back to an ordinary, `delegate-cloud`-issued entry.
 *
 * The delegation half is assembled, not issued: nothing here went through `delegate-cloud`, so there
 * is no delegation JWT to keep. What the session reads off that half is the cloud id (it is how the
 * committed cloud is told) and the two endpoints, and those are the invite's own. A later renewal
 * re-issues both halves through `delegate-cloud` as usual.
 */
export const tokensFromInviteLogin = (cloudId: string, entry: InviteLoginEntry): IssuedCloudTokens | null => {
    const { cloudToken, backend, wss } = entry;
    if (!cloudId || !cloudToken?.Token?.identityToken || !backend || !wss) return null;
    const now = Date.now();
    const remaining = msUntilExpiration(cloudToken.Token.credential?.Expiration, now);
    return {
        delegationToken: {
            delegationToken: '',
            cloudId,
            backend,
            wss,
            expiredAt: remaining == null ? 0 : now + remaining,
        },
        cloudToken,
    };
};

/**
 * Whether these tokens are an invite login's answer rather than a `delegate-cloud` issue. The
 * assembled delegation half above carries an empty JWT, and nothing else writes one: every
 * delegate-cloud issue returns a signed token. That empty string is the only trace the stored copy
 * keeps of HOW the cloud was entered, so it is what tells an invitee's session apart.
 */
export const isInviteLoginEntry = (delegationToken?: CloudDelegationTokenView | null): boolean =>
    delegationToken?.delegationToken === '';

/** One exchange per cloud at a time — see `issueCloudTokens`. */
const exchangesInFlight = new Map<string, Promise<IssuedCloudTokens>>();

const exchange = async (cloudId: string): Promise<IssuedCloudTokens> => {
    const delegationToken = await authRepository().delegateCloud(cloudId);
    const cloudToken = await authRepository().exchangeToken({
        baseURL: delegationToken.backend as string,
        body: { delegationToken: delegationToken.delegationToken },
    });

    cloudStore.setCachedCloudTokens(cloudId, { delegationToken, cloudToken });
    recordCloudIdentity(cloudId, cloudToken);
    return { delegationToken, cloudToken };
};

/**
 * Runs (or replays from the per-cloud cache) the two-call cloud token exchange for `cloudId` and
 * records the result in that cache. Commits nothing to the active cloud slot — what a successful
 * issue MEANS for the session is the caller's decision.
 *
 * **One exchange per cloud at a time.** A call that finds an exchange for the same cloud in flight
 * joins it instead of starting a second one. Three callers can ask for the same cloud at once — a
 * switch, the background-slot preparer, a renewal — and two exchanges would each write the cache,
 * last one winning, while the caller that lost may already have committed its own tokens to the
 * store or registered a socket with them. The cache and what that cloud's socket signs with would
 * then disagree. Joining is safe for every caller: an exchange in flight is as fresh as one started
 * now.
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

    const running = exchangesInFlight.get(cloudId);
    if (running) return running;

    const started = exchange(cloudId);
    exchangesInFlight.set(cloudId, started);
    try {
        return await started;
    } finally {
        exchangesInFlight.delete(cloudId);
    }
};

/**
 * Re-issues the tokens of `cloudId`, a cloud whose socket session is already up, leaving the
 * selection untouched. The cache entry is overwritten in place, so there is no window in which the
 * slot signing with the old token has nothing to sign from.
 *
 * Whether the result also lands in the session store is decided HERE, at write time, by whether
 * `cloudId` is the committed cloud at that moment — read off the delegation token exactly as
 * `getCommittedCloudId` does. The selected cid flips optimistically at the start of a switch, so it
 * cannot be the judge; and a renewal that started while this cloud was committed can finish after a
 * switch away, in which case the store now belongs to another cloud and only the cache is updated.
 *
 * Throws when the exchange fails, so the caller can decide whether that is worth retrying.
 */
export const reissueCloudTokens = async (cloudId: string): Promise<IssuedCloudTokens> => {
    // Cache bypassed on purpose: the entry was written by the very issue that is now lapsing, and its
    // own 60s margin would happily serve it back — a renewal that renews nothing.
    const issued = await issueCloudTokens(cloudId, { allowCache: false });

    if (cloudStore.getDelegationToken()?.cloudId !== cloudId) {
        logger.info('SESSION', '[cloudTokens] cloud tokens re-issued into the cache', { data: { cloudId } });
        return issued;
    }

    // One observable change (ADR-0076 decision 2): a renewal is not a cloud CHANGE, so observers must
    // not see a window where the delegation token moved but the cloud token had not.
    //
    // A committed invite entry is the one case where the re-issue names a DIFFERENT user: the invitee
    // was entered with the invite login's answer, and `delegate-cloud` answers for the relay user —
    // the owner, when an owned cloud is being reclaimed. That is an identity change, not a renewal.
    const replacesInvitee = isInviteLoginEntry(cloudStore.getDelegationToken());
    sessionSignal.batch(() => {
        cloudStore.saveDelegationToken(issued.delegationToken);
        // Merge, mirroring switchCloudSession's same-cloud branch: a re-issue is not guaranteed to
        // carry every field the stored view holds (profile fields notably). Not over the invitee,
        // though — a field the new answer omits would keep the invitee's value (its `$user`, its role).
        const existing = replacesInvitee ? null : cloudStore.getCloudToken();
        cloudStore.saveCloudToken(
            existing ? ({ ...existing, ...issued.cloudToken } as UserTokenView) : issued.cloudToken
        );
        // The selected place was the invitee's, and the new socket session does not start there. Kept,
        // a later switch into it would no-op as "already there" and site-scoped writes would land on
        // whatever site the new token names — the same reason a commit of issued tokens drops it.
        if (replacesInvitee) cloudStore.clearSelectedSite();

        // Re-derive uid/identity from the freshly written token, same as every other commit path.
        rebuildSessionIdentity();
    });
    logger.info('SESSION', '[cloudTokens] committed cloud tokens re-issued', { data: { cloudId } });
    return issued;
};
