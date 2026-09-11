import type { UserTokenView } from '@lemoncloud/chatic-backend-api';

/**
 * How an Auth-SDK-refreshed token view is merged into the stored one, per server (ADR-0076 결정 5).
 *
 * These were 45 lines of justification inside `commitServerRefreshedToken`, and that comment was the
 * ONLY thing holding the three relay preservation rules in place — no test named any of them. They
 * are pure functions of (stored, fresh), so extracting them makes each invariant a case.
 *
 * Functions, not a class: pure helpers follow the repo's own shape for this (`calcSignature` ·
 * `msUntilExpiration` · `deriveConnectivity`), and there is no state to hold.
 */

/** `$auth` is not on `UserTokenView`; the relay view carries it and only `.id` is ever read. */
type WithAuth = { $auth?: { id?: string } };

/**
 * relay: `stored` first, then the fresh view, then `$auth` and three `Token` fields put back by hand.
 *
 * **Why `stored` first.** A socket refresh view is not guaranteed to be a full user view, and the
 * relay token is also the ACCOUNT profile display source (`getRelaySessionUser`). Without the merge a
 * slim refresh silently drops name/photo/email and the MY page header blanks out mid-session.
 *
 * **`$auth` is preserved, not adopted — WORKAROUND for a backend defect.**
 *
 * `$auth.id` is the relay signature's outer HMAC key and the id the socket registers with
 * (signing.md §1). A site switch (`auth.switch` → refresh body carrying `target`) makes the backend
 * mint a CHILD auth model and return it as `$auth`, while `Token` in that same response comes from
 * the refresh issued against the PARENT. The child is created by `makeAuthByAccount`, which writes
 * only `stereo`/`accountId`/`clientIp`/`userAgent` — it never sets `identityId`, because the path
 * that normally supplies it (`issueAccessToken`'s `proxy.auth.set(id, $auth2)` after a Cognito
 * fetch) is not on this branch.
 *
 * So adopting that `$auth` leaves the store signing with (child `authId`, parent `identityId`) while
 * the server recomputes the same HMAC with `identityId` = `''`. Every later refresh then returns
 * `403 NOT ALLOWED - invalid sign @refreshAccessToken(<child authId>)`, permanently, until re-login
 * — and the session dies silently, because log upload dies with the credential. Verified against the
 * production auth record on 2026-09-11.
 *
 * Preserving is safe for the refresh path this merge serves: the non-`target` branch returns the
 * SAME `$auth` it loaded, so this is a no-op there. A genuinely new session does NOT come through
 * here — `relaySession.apply()` writes the view wholesale via `relayStore.saveRelayToken`. And
 * nothing else reads `$auth.id`: its only consumers are `getAuthRegistration` and `signAuth`.
 *
 * It also removes the drift this used to cause — with the store's `$auth.id` held still,
 * `authIdRegistry.resync` has nothing to re-seed.
 *
 * **Revert this once the backend carries `identityId`/`identityPoolId` into the child auth**; until
 * then the client cannot tell a usable `$auth` from an unusable one (the server's `identityId` is
 * not observable from here, and the SDK reports every refusal as `auth.refresh failed: server`).
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
        // Keyed on `.id`, not on `$auth` being present: a stored `$auth` without an id is not
        // something to hold on to (nothing can register or sign with it), so the view still wins there.
        $auth: (stored as (UserTokenView & WithAuth) | null)?.$auth?.id
            ? (stored as UserTokenView & WithAuth).$auth
            : (view as UserTokenView & WithAuth).$auth,
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
