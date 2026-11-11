import type { CloudDelegationTokenView, UserTokenView } from '@lemoncloud/chatic-backend-api';

import { logger } from '@chatic/logger';

import { authRepositorySource } from './authRepository';
import { cloudStore, msUntilExpiration, getUidInCloud, rebuildSessionIdentity, sessionSignal } from '@chatic/session';
import { recordCloudIdentity, uidOfCloudToken } from './cloudIdentity';
import { RELAY_CLOUD_ID, type IAuthRepository } from '@chatic/data';

/**
 * Cloud token ISSUANCE — deliberately off the session barrel (like `auth/authActions`).
 *
 * **Cloud recovery is re-issue, not refresh.** A cloud token is minted from the relay identity
 * (`delegate-cloud` is relay-signed HTTP), so as long as relay lives there is always a way to mint a
 * fresh one — `auth.refresh` on the cloud socket is an optimization, not the only route. Relay has no
 * such parent: its token can only be refreshed or re-logged-in. That asymmetry is the whole reason
 * relay and cloud manage their tokens separately, and it is why `RelayCredentialGuard` (refresh)
 * is relay-only while the cloud counterpart (`CloudCredentialGuard`) re-issues.
 *
 * Two callers with two different intents share the exchange below:
 *  - `cloudSession.switchTo` — ENTERING a cloud. May replay the per-cloud cache, and owns the
 *    selection (cid/sid) bookkeeping around the exchange.
 *  - `reissueCloudTokens` (here) — a cloud whose socket session is already up and whose credential
 *    is about to lapse. Never replays the cache (that is where the lapsing copy lives) and never
 *    touches the selection: the user has not navigated anywhere.
 */
const authRepository = (): IAuthRepository => authRepositorySource.get();

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

/**
 * The relay user each cloud's latest finished exchange was asked as, for this page life. Not stored:
 * its only reader is the owned-cloud reclaim, which needs to know whether the answer it joined was
 * asked as the account or as the guest the account signed in from — `delegate-cloud` answers for the
 * relay user that signed the request, so one that started before a sign-in answers for the guest.
 */
const lastIssuedFor = new Map<string, string | null>();

/**
 * A fresh issue named a different user in a cloud than the one this account is recorded as there, and
 * was refused. Nothing was written: the cache, the identity map and the session store still name the
 * recorded user.
 */
export class CloudIdentityChangedError extends Error {
    constructor(
        readonly cloudId: string,
        readonly recordedUid: string,
        readonly issuedUid: string
    ) {
        super(`cloud[${cloudId}] re-issue named user[${issuedUid}], not the recorded user[${recordedUid}]`);
        this.name = 'CloudIdentityChangedError';
    }
}

/** The role a cloud token was issued with — top level on the view, or on its `$user`. */
const roleOfCloudToken = (token: UserTokenView): unknown => {
    const view = token as { userRole?: unknown; $user?: { userRole?: unknown } };
    return view.userRole ?? view.$user?.userRole;
};

/**
 * Refuses an issue that would move this account to another user inside a cloud it already has a user
 * in.
 *
 * `delegate-cloud` does not hand back the user an invitee accepted as. It picks the relay user the
 * request comes from (for a signed-in account, the guest this session signed in from), and
 * the exchange finds or CREATES that user's account in the cloud. When that is not the guest whose
 * invite login made the invitee, the answer is a new, empty user: no place, no room, every request
 * refused. Committing it hides every room the invitee had and writes the new uid over the recorded
 * one, which was the last trace of the right user.
 *
 * The one change that is meant to happen is the owner reclaim (`reclaimOwnedClouds`): a device that
 * held an invitee's token for a cloud the account owns gets the owner back. Only the server can issue
 * an owner token, so a new user whose token says `owner` is let through.
 *
 * With nothing recorded for the cloud (a first entry, or after the account signed out) there is no
 * user to keep, and any answer is taken.
 */
const assertSameCloudIdentity = (cloudId: string, cloudToken: UserTokenView): void => {
    const recordedUid = cloudStore.getCloudIdentity(cloudId)?.uid;
    const issuedUid = uidOfCloudToken(cloudToken);
    if (!recordedUid || !issuedUid || recordedUid === issuedUid) return;
    if (roleOfCloudToken(cloudToken) === 'owner') return;
    logger.error('SESSION', '[cloudTokens] cloud re-issue named a different user — refused', {
        data: { cloudId, recordedUid, issuedUid },
    });
    refusals.set(cloudId, { recordedUid, issuedUid });
    throw new CloudIdentityChangedError(cloudId, recordedUid, issuedUid);
};

/**
 * Refusals this page life has seen, by cloud. The server gives the same answer until something on
 * this device changes who the account is recorded as in the cloud, so asking again would only repeat
 * the round trip on every renewal tick and background retry. A refusal is answered from here as long
 * as the recorded uid is still the one it was refused over. Accepting the invite again, a pairing
 * taking the cloud over, or a sign-out moves or clears that uid, and the next exchange asks the
 * server again.
 */
const refusals = new Map<string, { recordedUid: string; issuedUid: string }>();

/** Test seam — forgets every refusal, as a fresh page life would. */
export const resetCloudIdentityRefusals = (): void => {
    refusals.clear();
};

const throwIfRefusedBefore = (cloudId: string): void => {
    const refusal = refusals.get(cloudId);
    if (!refusal) return;
    if (cloudStore.getCloudIdentity(cloudId)?.uid !== refusal.recordedUid) {
        refusals.delete(cloudId);
        return;
    }
    throw new CloudIdentityChangedError(cloudId, refusal.recordedUid, refusal.issuedUid);
};

const exchange = async (cloudId: string): Promise<IssuedCloudTokens> => {
    throwIfRefusedBefore(cloudId);
    // Read before anything awaits: a sign-in can land while the exchange is on the wire.
    const issuedFor = getUidInCloud(RELAY_CLOUD_ID);
    const delegationToken = await authRepository().delegateCloud(cloudId);
    const cloudToken = await authRepository().exchangeToken({
        baseURL: delegationToken.backend as string,
        body: { delegationToken: delegationToken.delegationToken },
    });
    assertSameCloudIdentity(cloudId, cloudToken);

    cloudStore.setCachedCloudTokens(cloudId, { delegationToken, cloudToken });
    recordCloudIdentity(cloudId, cloudToken);
    lastIssuedFor.set(cloudId, issuedFor);
    return { delegationToken, cloudToken };
};

/** Whether a `delegate-cloud` exchange for `cloudId` is on the wire now. */
export const isExchangeInFlight = (cloudId: string): boolean => exchangesInFlight.has(cloudId);

/**
 * The relay user the latest exchange for `cloudId` that finished in this page life was asked as.
 * `undefined` when none has; `null` when one ran with no relay user to read.
 */
export const lastIssuedForOf = (cloudId: string): string | null | undefined => lastIssuedFor.get(cloudId);

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
    // When the re-issue names a DIFFERENT user it is an identity change, not a renewal — the owned
    // cloud reclaim does exactly that: the store holds the device's guest and `delegate-cloud` answers
    // for the relay user, the owner. Two marks say so. A committed invite entry (the invite login's
    // own answer). Or a stored token whose uid differs from the re-issued one's: a token the guest had
    // re-issued before the sign-in is an ordinary issue by then, and only the uid it names still tells
    // it apart. A same-user renewal names the same uid and merges as before.
    const storedToken = cloudStore.getCloudToken();
    const storedUid = storedToken ? uidOfCloudToken(storedToken) : null;
    const issuedUid = uidOfCloudToken(issued.cloudToken);
    const replacesAnotherUser =
        isInviteLoginEntry(cloudStore.getDelegationToken()) || (!!storedUid && !!issuedUid && storedUid !== issuedUid);
    sessionSignal.batch(() => {
        cloudStore.saveDelegationToken(issued.delegationToken);
        // Merge, mirroring switchCloudSession's same-cloud branch: a re-issue is not guaranteed to
        // carry every field the stored view holds (profile fields notably). Not over another user,
        // though — a field the new answer omits would keep that user's value (its `$user`, its role).
        const existing = replacesAnotherUser ? null : storedToken;
        cloudStore.saveCloudToken(
            existing ? ({ ...existing, ...issued.cloudToken } as UserTokenView) : issued.cloudToken
        );
        // The selected place was the other user's, and the new socket session does not start there.
        // Kept, a later switch into it would no-op as "already there" and site-scoped writes would land
        // on whatever site the new token names — the same reason a commit of issued tokens drops it.
        if (replacesAnotherUser) cloudStore.clearSelectedSite();

        // Re-derive uid/identity from the freshly written token, same as every other commit path.
        rebuildSessionIdentity();
    });
    logger.info('SESSION', '[cloudTokens] committed cloud tokens re-issued', { data: { cloudId } });
    return issued;
};
