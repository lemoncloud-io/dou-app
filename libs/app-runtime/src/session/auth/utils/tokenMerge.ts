import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * How an Auth-SDK-refreshed token view is merged into the stored one, per server (ADR-0074 결정 5).
 *
 * These were 45 lines of justification inside `commitServerRefreshedToken`, and that comment was the
 * ONLY thing holding the three relay preservation rules in place — no test named any of them. They
 * are pure functions of (stored, fresh), so extracting them makes each invariant a case.
 *
 * Functions, not a class: pure helpers follow the repo's own shape for this (`calcSignature` ·
 * `msUntilExpiration` · `deriveConnectivity`), and there is no state to hold.
 */

/**
 * relay: `stored` first, then the fresh view, then three fields put back by hand.
 *
 * **Why `stored` first.** A socket refresh view is not guaranteed to be a full user view, and the
 * relay token is also the ACCOUNT profile display source (`getRelaySessionUser`). Without the merge a
 * slim refresh silently drops name/photo/email and the MY page header blanks out mid-session.
 *
 * **The three preserved `Token` fields, each for its own reason:**
 *
 *  - `identityToken` — a refresh view may omit it (the SDK falls back to the token it already
 *    holds), but relay REQUIRES it: signed HTTP sends it as `x-lemon-identity` and the next register
 *    reads it back through `getIdentityToken()`.
 *  - `identityPoolId` — routinely omitted, and this merge feeds BOTH stores (relayStore here, and
 *    lemon's own store via `buildCredentialsByToken`, which calls `saveOAuthToken` internally and
 *    overwrites the field with `''`). Without this line the pool id is lost from every copy after the
 *    first socket refresh, and the relay HTTP refresh's `identityPoolId` inheritance silently becomes
 *    a no-op. Pre-existing defect, surfaced by ADR-0070 3단계 체크리스트 5.
 *  - `credential` — this copy is the only record of WHICH credential is currently signing. When the
 *    view carries none the caller leaves lemon's cache on the PREVIOUS credential, so dropping the
 *    field here would make the store disagree with the signer, and the credential clock (which reads
 *    it to tell a signature rejection from a network outage) would report "cannot measure" for
 *    exactly that window.
 */
export const mergeRefreshedRelayToken = (
    stored: UserTokenView | null,
    view: UserTokenView & { Token: NonNullable<UserTokenView['Token']> }
): UserTokenView =>
    ({
        ...stored,
        ...view,
        Token: {
            ...view.Token,
            identityToken: view.Token.identityToken ?? stored?.Token?.identityToken,
            identityPoolId: view.Token.identityPoolId ?? stored?.Token?.identityPoolId,
            credential: view.Token.credential ?? stored?.Token?.credential,
        },
    }) as UserTokenView;

/**
 * cloud: a shallow merge over the stored view, or the view itself when there is nothing stored.
 *
 * No per-field preservation, and that asymmetry is the point (signing.md §3): nothing signs with the
 * cloud credential — the one request that did was the cloud HTTP refresh, deleted by ADR-0070 — so
 * the cloud token owes only the SOCKET signature, which reads the store live per packet. Persisting
 * is the whole job. The shallow merge exists for the same profile-field reason as relay's.
 */
export const mergeRefreshedCloudToken = (stored: UserTokenView | null, view: UserTokenView): UserTokenView =>
    stored ? ({ ...stored, ...view } as UserTokenView) : view;
